# Physical iPad / Safari checklist — one editor per workspace

Automation covers Chromium only. Run these on a real iPad (iPadOS 17 or later,
Safari) against a production build (`npm run build && npm run preview -- --host`,
or the deployed site). Use fictional data. Record pass/fail and a screenshot per
step.

| # | Steps | Expected |
| --- | --- | --- |
| 1 | Open Football OS in one Safari tab. | No "View only" chip; editing works. |
| 2 | Open a second Safari tab to the same address. | Second tab shows **VIEW ONLY** chip and "This workspace is being edited in another tab" with **Edit here**. Player inspector shows "View only". |
| 3 | In tab 1 rename X to `T1`. Switch to tab 2. | Tab 2 shows `T1` within a second or two (it follows saved data). |
| 4 | In tab 2 tap **Edit here**. | Tab 2 becomes the editor within ~2 s; switching back, tab 1 shows "Editing moved to another tab". |
| 5 | In tab 2 (now editor) open **Play details**, type a new name, do not save. Switch to tab 1, tap **Edit here**. | Tab 1 says "Waiting for the editing tab… unfinished changes (Play details…)". Nothing is taken over. |
| 6 | Switch to tab 2. | The dialog shows "Another tab is waiting to edit…". Tap **Save details**: tab 1 becomes editor and shows the new name. |
| 7 | **Split View**: open a second Football OS window side by side. | Same behaviour as tabs: exactly one window edits. |
| 8 | With tab 1 editing, press the Home button, wait 10 minutes, open Safari again. | Tab 1 is still the editor (a suspended editor keeps ownership). |
| 9 | Close the editing tab (tab switcher, swipe away). In the other tab wait 2 s. | "No tab is editing this workspace right now." **Edit here** takes over immediately and shows the last saved edit. |
| 10 | Start a **Game Day Adjust**, rename a player, then in another tab **Edit here**. | Handover completes; the new editor shows the **Temporary** chip and the edit; each resolution (Discard / Replace / Variation / New) behaves as labelled. |
| 11 | **Backup and export → Download preservation file**, during an adjustment. | A `.footballos` file saves to Files. Re-importing it via **Choose backup to restore** shows "preservation file · game-day adjustment with its original". |
| 12 | Restore a backup twice. | The second restore requires **Replace the earlier recovery copy** and offers **Download earlier copy**. |
| 13 | Settings → Safari → Advanced → Experimental Features: if a "Web Locks API" toggle exists, turn it off and reload. | App opens **View only in this browser** with update guidance. Turn it back on. |
| 14 | Airplane Mode after "Offline ready", relaunch from Home Screen. | Board opens; one-editor behaviour unchanged offline (it is local). |
| 15 | Fill storage (very large playbooks) until "Changes could not be saved", then **Edit here** from another tab. | The editor keeps control and offers **Download preservation file**; the waiting tab says the editor could not save. |

Notes: iPadOS may discard a background tab's page entirely; that is a
termination (step 9 behaviour), not a handover — unsaved edits from the last
fraction of a second can be lost, as with any crash. Safari has supported Web
Locks since 15.4.
