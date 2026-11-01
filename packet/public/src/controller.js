// Companion state and actions. No DOM: browser effects arrive as adapters.
//
// Every user action advances `epoch`. A file read only applies if no action happened
// while it was pending, so a slow or interrupted read can never replace newer work.
import { PacketError } from './common.js';
import {
  MAX_IMPORT_CHARS, OUTPUTS, createPacket, createSchemePacket, packetFilename, readImport, readSchemePackageText, serializePacket, verifyPacketTeaching, withOutput,
} from './packet.js';
import { classifyRevision, deriveRevisionStatus } from './schemePackage.js';

export const LOCAL_LABELS = Object.freeze({ unsaved: 'Unsaved', saved: 'Saved locally', unavailable: 'Storage unavailable' });
export const EXPORT_LABEL = 'Export requested';
const REPEAT_WINDOW_MS = 800;

const reasonOf = (error) => (error instanceof PacketError ? error.message : 'The input could not be processed.');

export function createController({ store, samplePractice, download, print, now = () => Date.now(), onChange = () => {} }) {
  const state = {
    intake: null,
    dayId: null,
    packet: null,
    output: 'coach',
    local: 'unsaved',
    exportRequested: false,
    reading: false,
    notice: null,
    /** Verified coach packages for this session only; a packet embeds what it needs. */
    schemes: [],
    schemePreview: null,
    teachingStatus: null,
    teachingIntegrity: null,
  };
  let savedText = null;
  let epoch = 0;
  let lastExport = { text: null, at: -Infinity };
  let lastPrintAt = -Infinity;
  let lastPrintText = null;
  let schemeTask = null;
  const listeners = new Set();
  const verifiedTeachings = new WeakSet();

  const emit = () => {
    onChange(state);
    for (const listener of listeners) listener(state);
  };
  const notify = (kind, text) => { state.notice = { kind, text }; };

  function refreshTeachingStatus() {
    const pin = state.packet?.teaching?.pin ?? null;
    if (!pin) { state.teachingStatus = null; return; }
    const same = state.schemes.filter((pkg) => pkg.packageId === pin.packageId);
    const latest = same.reduce((best, pkg) => (!best || pkg.revision > best.revision ? pkg : best), null);
    state.teachingStatus = latest ? deriveRevisionStatus(latest, pin) : 'not-checked';
  }

  /** Reads and classifies a package without loading it. Newer actions drop this result. */
  async function previewScheme(text, ticket) {
    state.reading = true;
    notify('info', 'Checking the scheme package and its digests…');
    emit();
    const read = await readSchemePackageText(text);
    if (ticket !== epoch) return;
    state.reading = false;
    if (!read.ok) {
      state.schemePreview = null;
      notify('error', `${read.errors[0].message} Nothing was imported; the current packet is unchanged.`);
      emit();
      return;
    }
    const held = state.schemes.filter((pkg) => pkg.packageId === read.pkg.packageId);
    const latest = held.reduce((best, pkg) => (!best || pkg.revision > best.revision ? pkg : best), null);
    const entry = latest ? { familyId: latest.familyId, current: { revision: latest.revision, contentDigest: latest.contentDigest }, revisions: held } : null;
    const { action, conflicts } = classifyRevision(entry, read.pkg);
    state.schemePreview = {
      action: read.heldAssets.length ? 'held' : action, conflicts, heldAssets: read.heldAssets, approvalClaim: read.approvalClaim, pkg: read.pkg,
      summary: { packageId: read.pkg.packageId, revision: read.pkg.revision, contentDigest: read.pkg.contentDigest, callCount: read.pkg.calls.length },
    };
    notify('info', 'Scheme package checked. Review the preview, then confirm to load it for this session.');
    emit();
  }

  function supersede() {
    epoch += 1;
    if (state.reading) {
      state.reading = false;
      notify('info', 'The earlier file read was dropped.');
    }
  }

  function setPacket(packet) {
    if (packet.teaching && !verifiedTeachings.has(packet.teaching)) throw new PacketError('Held: this teaching snapshot has not passed verification.');
    const text = serializePacket(packet);
    state.output = packet.output;
    state.dayId = packet.source.dayId;
    if (state.packet && serializePacket(state.packet) === text) return;
    state.packet = packet;
    state.exportRequested = false;
    state.local = text === savedText ? 'saved' : 'unsaved';
    state.teachingIntegrity = packet.teaching ? 'verified' : null;
    refreshTeachingStatus();
  }

  async function verifyAndOpen(packet, ticket, saved = false) {
    state.reading = true;
    notify('info', 'Checking the saved teaching snapshot before opening it…');
    emit();
    const result = await verifyPacketTeaching(packet);
    if (ticket !== epoch) return false;
    state.reading = false;
    if (!result.ok) {
      notify('error', `Held: ${result.reason} Nothing was imported; the current packet is unchanged.`);
      emit();
      return false;
    }
    verifiedTeachings.add(packet.teaching);
    if (saved) savedText = serializePacket(packet);
    state.intake = null;
    setPacket(packet);
    notify('ok', saved ? 'Reopened the verified packet saved in this browser.' : 'Verified packet opened. Nothing was written to either source app.');
    emit();
    return true;
  }

  function applyImport(text) {
    let result;
    try {
      result = readImport(text);
    } catch (error) {
      notify('error', `${reasonOf(error)} Nothing was imported; the current packet is unchanged.`);
      return false;
    }
    if (result.kind === 'scheme-package') {
      schemeTask = previewScheme(result.text, epoch);
      return true;
    }
    if (result.kind === 'packet') {
      if (result.packet.teaching) {
        schemeTask = verifyAndOpen(result.packet, epoch);
        return true;
      }
      state.intake = null;
      setPacket(result.packet);
      notify('ok', 'Packet opened. Nothing was written to either source app.');
      return true;
    }
    state.intake = result.intake;
    state.dayId = null;
    const days = result.intake.days.length;
    notify('ok', `Imported ${days} practice ${days === 1 ? 'day' : 'days'}. Choose the day for this session; none is picked for you.${state.packet ? ' The current packet stays until you do.' : ''}`);
    return true;
  }

  return {
    state,

    /** Extra change listener, so optional controls mount without touching the app entry. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Loads the previewed package for this session. Packets already built are not touched. */
    confirmScheme() {
      supersede();
      const preview = state.schemePreview;
      if (!preview) {
        notify('error', 'There is no scheme package to confirm.');
      } else if (preview.action === 'held') {
        state.schemePreview = null;
        notify('error', 'Held: this package is missing referenced material, so it was not loaded.');
      } else {
        state.schemePreview = null;
        if (preview.action !== 'noop') state.schemes = [...state.schemes, preview.pkg];
        refreshTeachingStatus();
        notify('ok', preview.action === 'noop' ? 'This exact revision is already loaded. Nothing changed.' : `Revision ${preview.summary.revision} loaded for this session. The current packet is unchanged.`);
      }
      emit();
    },

    cancelScheme() {
      supersede();
      state.schemePreview = null;
      notify('info', 'Scheme preview cancelled. Nothing was imported.');
      emit();
    },

    /** Builds version 2 from one explicit pin. A failure leaves the current packet in place. */
    async chooseSchemeCall({ dayId, periodId, callId }) {
      supersede();
      const ticket = epoch;
      let packet;
      try {
        packet = await createSchemePacket({ intake: state.intake, dayId, periodId, callId, schemes: state.schemes, output: state.output });
        const integrity = await verifyPacketTeaching(packet);
        if (!integrity.ok) throw new PacketError(`Held: ${integrity.reason}`);
      } catch (error) {
        if (ticket !== epoch) return;
        notify('error', `${reasonOf(error)} The current packet is unchanged.`);
        emit();
        return;
      }
      if (ticket !== epoch) return;
      verifiedTeachings.add(packet.teaching);
      setPacket(packet);
      notify('ok', state.local === 'saved' ? 'Packet ready. This copy matches the packet saved in this browser.' : 'Packet ready from the pinned revision. It is not saved yet.');
      emit();
    },

    /** Compatibility wait hook; unverified packets never enter visible state. */
    async verifyTeaching() {
      if (schemeTask) { await schemeTask; return; }
      const { packet } = state;
      if (!packet?.teaching || state.teachingIntegrity === 'verified') return;
      const result = await verifyPacketTeaching(packet);
      if (state.packet !== packet) return;
      if (result.ok) { verifiedTeachings.add(packet.teaching); state.teachingIntegrity = 'verified'; }
      else { state.packet = null; state.local = 'unsaved'; state.teachingIntegrity = 'failed'; notify('error', `Held: ${result.reason} Re-create the packet from its sources.`); }
      emit();
    },

    init() {
      const found = store.read();
      if (found.status === 'unavailable') {
        state.local = 'unavailable';
        notify('error', `${found.message} The companion still works here, but nothing can be saved in this browser.`);
      } else if (found.status === 'found') {
        try {
          const result = readImport(found.text);
          if (result.kind !== 'packet') throw new PacketError('The saved data is not a session packet.');
          if (result.packet.teaching) {
            schemeTask = verifyAndOpen(result.packet, epoch, true);
            return schemeTask;
          }
          savedText = serializePacket(result.packet);
          setPacket(result.packet);
          notify('ok', 'Reopened the packet saved in this browser.');
        } catch (error) {
          notify('error', `The saved packet could not be opened: ${reasonOf(error)} It was left in place; saving a new packet replaces it.`);
        }
      }
      emit();
    },

    loadSample() {
      supersede();
      applyImport(JSON.stringify(samplePractice));
      emit();
    },

    /** Returns true if the text was accepted. */
    importText(text) {
      supersede();
      const accepted = applyImport(text);
      emit();
      return accepted;
    },

    async importFile(file) {
      if (!file) return;
      supersede();
      if (file.size > MAX_IMPORT_CHARS) {
        notify('error', 'This file is too large to be a packet or Practice export. Nothing was imported; the current packet is unchanged.');
        emit();
        return;
      }
      const ticket = epoch;
      state.reading = true;
      notify('info', 'Reading file…');
      emit();
      let text;
      try {
        text = await file.text();
      } catch {
        if (ticket !== epoch) return;
        state.reading = false;
        notify('error', 'The file could not be read. Nothing was imported; the current packet is unchanged. You can try again.');
        emit();
        return;
      }
      if (ticket !== epoch) return;
      state.reading = false;
      schemeTask = null;
      applyImport(text);
      if (schemeTask) {
        const task = schemeTask;
        schemeTask = null;
        await task;
        return;
      }
      emit();
    },

    chooseDay(dayId) {
      supersede();
      try {
        setPacket(createPacket({ intake: state.intake, dayId, output: state.output }));
        notify('ok', state.local === 'saved' ? 'Packet ready. This copy matches the packet saved in this browser.' : 'Packet ready. It is not saved yet.');
      } catch (error) {
        notify('error', `${reasonOf(error)} The current packet is unchanged.`);
      }
      emit();
    },

    chooseOutput(output) {
      supersede();
      if (!OUTPUTS.includes(output)) {
        notify('error', 'Unknown output choice.');
      } else {
        state.output = output;
        if (state.packet) {
          setPacket(withOutput(state.packet, output));
          notify('info', state.local === 'saved' ? 'This copy matches the packet saved in this browser.' : 'Output changed. Save in this browser to keep this version.');
        }
      }
      emit();
    },

    save() {
      supersede();
      if (!state.packet) {
        notify('error', 'There is no packet to save yet.');
        emit();
        return;
      }
      const text = serializePacket(state.packet);
      const result = store.write(text);
      if (result.ok) {
        savedText = text;
        state.local = 'saved';
        notify('ok', 'Saved in this browser. Reopening this page here restores it.');
      } else {
        state.local = 'unavailable';
        notify('error', `${result.message} This packet was not saved. The preview stays available; Download packet JSON keeps a copy.`);
      }
      emit();
    },

    exportPacket() {
      supersede();
      if (!state.packet) {
        notify('error', 'There is no packet to download yet.');
        emit();
        return;
      }
      const text = serializePacket(state.packet);
      if (text === lastExport.text && now() - lastExport.at < REPEAT_WINDOW_MS) return;
      try {
        download(packetFilename(state.packet), text);
      } catch {
        notify('error', 'The download could not be requested. Nothing was exported.');
        emit();
        return;
      }
      lastExport = { text, at: now() };
      state.exportRequested = true;
      notify('info', 'Export requested. The browser handles the download, so check that the file arrived.');
      emit();
    },

    printPacket() {
      supersede();
      if (!state.packet) {
        notify('error', 'There is no packet to print yet.');
        emit();
        return;
      }
      const text = serializePacket(state.packet);
      if (text === lastPrintText && now() - lastPrintAt < REPEAT_WINDOW_MS) return;
      lastPrintAt = now();
      lastPrintText = text;
      emit();
      print();
    },
  };
}
