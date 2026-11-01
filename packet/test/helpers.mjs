import { clone } from '../public/src/common.js';
import { createController } from '../public/src/controller.js';
import { readImport, createPacket, readPracticeDocument } from '../public/src/packet.js';
import { samplePractice } from '../public/src/sample-practice.js';
import { STORAGE_KEY, createPacketStore } from '../public/src/storage.js';

export const DAY_60 = 'day-flv64xgtoo';
export const DAY_45 = 'day-myhzmv1jh7';

export const practiceDoc = () => clone(samplePractice);
export const intake = () => readPracticeDocument(practiceDoc());
export const packetFor = (dayId = DAY_60, output = 'coach') => createPacket({ intake: intake(), dayId, output });
export { readImport };

/** A storage double whose failures can be switched on per test. */
export function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    failWrite: null,
    failRead: null,
    dropWrites: false,
    getItem(key) {
      if (this.failRead) throw this.failRead;
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      if (this.failWrite) throw this.failWrite;
      if (!this.dropWrites) entries.set(key, value);
    },
  };
}

export const named = (name) => Object.assign(new Error(name), { name });

export function controllerWith({ storage = memoryStorage(), getStorage = () => storage, now = () => 0, download } = {}) {
  const downloads = [];
  const prints = [];
  const controller = createController({
    store: createPacketStore(getStorage),
    samplePractice,
    download: download ?? ((name, text) => downloads.push({ name, text })),
    print: () => prints.push(1),
    now,
  });
  return { controller, storage, downloads, prints };
}

export function deferredFile() {
  let resolve;
  let reject;
  const pending = new Promise((ok, no) => { resolve = ok; reject = no; });
  return { size: 100, text: () => pending, resolve, reject };
}

export const fileWith = (text) => ({ size: text.length, text: async () => text });

export { STORAGE_KEY };
