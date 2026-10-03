/** (d) Backup, restore into a fresh profile, restore over existing data, restore twice, double-tap. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EVIDENCE, RECOVERY_KEY, ROOT, WORKSPACE_KEY, dataTools, deepEqual, findPlay, heading, labelsOnField, launch, openApp,
  pickPlay, rawSaved, recorder, renameSelected, saved, selectToken, settleSave,
} from "./lib.mjs";

const PLAY = "Trips Rt 24 Blast";
const BACKUP = join(ROOT, "rehearsal-backup.footballos");
const rec = recorder("d-backup-restore");
const browser = await launch();
const storageState = process.env.STORAGE_STATE ?? join(EVIDENCE, "c-export-cover3.storage.json");

// --- 1. back up from the working profile ---------------------------------
const a = await openApp(browser, { storageState });
const before = await saved(a.page);
const rawBefore = await rawSaved(a.page);
await dataTools(a.page);
const dl = a.page.waitForEvent("download");
await a.page.getByRole("button", { name: /Download backup/ }).click();
const file = await dl;
await file.saveAs(BACKUP);
const bytes = await readFile(BACKUP);
const backup = JSON.parse(bytes.toString("utf8"));
const sha = createHash("sha256").update(bytes).digest("hex");
rec.check("backup: a .footballos envelope downloaded", file.suggestedFilename().endsWith(".footballos") && backup.format === "football-os-workspace" && backup.formatVersion === 3, { suggested: file.suggestedFilename(), sha256: sha, bytes: bytes.length });
rec.check("backup: the envelope's workspace equals the live stored workspace", deepEqual(backup.workspace, before), { playbooks: backup.workspace.playbooks.length, plays: backup.workspace.playbooks.reduce((n, b) => n + b.plays.length, 0) });
rec.check("backup: carries the rehearsal plays", Boolean(findPlay(backup.workspace, PLAY)) && Boolean(findPlay(backup.workspace, `${PLAY} Variation`)) && backup.workspace.playbooks[0].plays.some((p) => p.name.startsWith("Cover 3")));
// double-tap backup
const downloads = [];
a.page.on("download", (d) => downloads.push(d));
const btn = a.page.getByRole("button", { name: /Download backup/ });
await btn.dispatchEvent("click"); await btn.dispatchEvent("click");
await a.page.waitForTimeout(1500);
const twice = await Promise.all(downloads.map(async (d) => (await readFile(await d.path())).toString("utf8")));
const twiceParsed = twice.map((t) => JSON.parse(t));
rec.check("double-tap backup: two valid files with identical workspaces (only exportedAt differs), no errors", downloads.length === 2 && deepEqual(twiceParsed[0]?.workspace, twiceParsed[1]?.workspace) && twiceParsed[0].format === "football-os-workspace" && a.errors.length === 0, { downloads: downloads.length, exportedAt: twiceParsed.map((t) => t.exportedAt), errors: a.errors });
await a.page.keyboard.press("Escape");

// --- 2. restore into a fresh browser profile -----------------------------
const b = await openApp(browser);   // new context: empty localStorage, fresh SW, fresh cache
const freshWs = await saved(b.page);
rec.check("fresh profile: starts from the seed workspace, without the rehearsal play", !findPlay(freshWs, PLAY), { heading: await heading(b.page) });
await dataTools(b.page);
await b.page.locator(".file-action input[type=file]").setInputFiles(BACKUP);
await b.page.waitForTimeout(500);
const preview = await b.page.locator(".restore-preview").textContent();
rec.check("fresh profile: backup validates and previews counts", /Valid Football OS backup/.test(preview), preview.trim());
await b.page.getByRole("button", { name: "Restore this backup", exact: true }).click();
await b.page.waitForTimeout(1500);
const restored = await saved(b.page);
rec.check("fresh profile: stored workspace equals the backup exactly", deepEqual(restored, backup.workspace));
rec.check("fresh profile: stored workspace equals the source profile's stored workspace", (await rawSaved(b.page)) === rawBefore || deepEqual(restored, before));
const recovery = await saved(b.page, RECOVERY_KEY);
rec.check("fresh profile: the replaced (seed) workspace was kept as a recovery copy", deepEqual(recovery?.workspace, freshWs));
await pickPlay(b.page, PLAY);
rec.check("fresh profile: the rehearsal play opens on screen", (await heading(b.page)) === PLAY && (await labelsOnField(b.page)).includes("RP"));
await b.page.reload({ waitUntil: "networkidle" });
await b.page.waitForTimeout(1200);
rec.check("fresh profile: restore survives a reload", deepEqual(await saved(b.page), backup.workspace));
await b.page.screenshot({ path: join(EVIDENCE, "d-fresh-profile-restored.png") });
rec.check("fresh profile: no errors", b.errors.length === 0, b.errors);

// --- 3. restore over existing data ---------------------------------------
await pickPlay(a.page, PLAY);
await selectToken(a.page, "RP");
await renameSelected(a.page, "OV");
await settleSave(a.page);
const dirty = await saved(a.page);
rec.check("over existing: an edit (OV) is saved before restoring", findPlay(dirty, PLAY).players.some((p) => p.label === "OV"));
await dataTools(a.page);
await a.page.locator(".file-action input[type=file]").setInputFiles(BACKUP);
await a.page.waitForTimeout(500);
await a.page.getByRole("button", { name: "Restore this backup", exact: true }).click();
await a.page.waitForTimeout(300);
const restoreToast = await a.page.locator(".toast, .feedback, [role=status]").first().textContent().catch(() => "");
await a.page.waitForTimeout(1200);
rec.check("over existing: workspace equals the backup; the edit is gone from the live play", deepEqual(await saved(a.page), backup.workspace) && !(await labelsOnField(a.page)).includes("OV"));
rec.check("over existing: the overwritten workspace (with OV) is the recovery copy", deepEqual((await saved(a.page, RECOVERY_KEY))?.workspace, dirty));
rec.check("over existing: toast confirms and names the recovery copy", /restored/.test(restoreToast ?? ""), restoreToast);

// --- 4. restore the same backup twice ------------------------------------
await dataTools(a.page);
await a.page.locator(".file-action input[type=file]").setInputFiles(BACKUP);
await a.page.waitForTimeout(500);
await a.page.getByRole("button", { name: "Restore this backup", exact: true }).click();
await a.page.waitForTimeout(1500);
rec.check("twice: second restore of the same file leaves the workspace equal to the backup", deepEqual(await saved(a.page), backup.workspace));
rec.check("twice: recovery copy now holds the first restore's result (equal to the backup)", deepEqual((await saved(a.page, RECOVERY_KEY))?.workspace, backup.workspace));

// --- 5. double-tap restore -----------------------------------------------
await dataTools(a.page);
await a.page.locator(".file-action input[type=file]").setInputFiles(BACKUP);
await a.page.waitForTimeout(500);
const restoreButton = a.page.getByRole("button", { name: "Restore this backup", exact: true });
await restoreButton.dispatchEvent("click");
await restoreButton.dispatchEvent("click").catch(() => {});
await a.page.waitForTimeout(1500);
rec.check("double-tap restore: workspace still equals the backup, dialog closed, no errors", deepEqual(await saved(a.page), backup.workspace) && (await a.page.locator(".data-tools-modal").count()) === 0 && a.errors.length === 0, a.errors);

// --- 6. reload mid-restore: reload immediately after confirming ----------
await dataTools(a.page);
await a.page.locator(".file-action input[type=file]").setInputFiles(BACKUP);
await a.page.waitForTimeout(500);
await a.page.getByRole("button", { name: "Restore this backup", exact: true }).click();
await a.page.reload({ waitUntil: "networkidle" });
await a.page.waitForTimeout(1200);
rec.check("reload right after restore: workspace equals the backup", deepEqual(await saved(a.page), backup.workspace));

// --- 7. a damaged file is refused without touching anything --------------
const bad = JSON.stringify({ ...backup, workspace: { ...backup.workspace, playbooks: [] } });
await dataTools(a.page);
await a.page.locator(".file-action input[type=file]").setInputFiles({ name: "bad.footballos", mimeType: "application/json", buffer: Buffer.from(bad) });
await a.page.waitForTimeout(500);
rec.check("damaged file: refused with a message and no Restore button", (await a.page.locator(".restore-error").count()) === 1 && (await a.page.getByRole("button", { name: "Restore this backup" }).count()) === 0, await a.page.locator(".restore-error").textContent().catch(() => null));
await a.page.keyboard.press("Escape");
rec.check("damaged file: workspace untouched", deepEqual(await saved(a.page), backup.workspace));
rec.check("no console or page errors through (d)", a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors]);

await writeFile(join(EVIDENCE, "d-backup-sha256.txt"), `${sha}  rehearsal-backup.footballos\n`);
await a.context.storageState({ path: join(EVIDENCE, "d-backup-restore.storage.json") });
const fails = await rec.save();
await browser.close();
process.exit(fails ? 1 : 0);
