# KelasRapi component inventory

The visual language is shared across FigCraft and React Native: light blue surface `#EAF4FF`, navy text `#24354D`, teal action `#187F79`, coral primary action `#FF795C`, white border, 16–20px radius, and soft neumorphic elevation.

| Component         | Variants/states                  | Used by                         | Change trace                                       |
| ----------------- | -------------------------------- | ------------------------------- | -------------------------------------------------- |
| Bottom navigation | active, inactive                 | all primary screens             | token/icon/label changes affect every screen shell |
| Primary action    | default, pressed, disabled       | save, add, export               | coral button token and 52–56dp target              |
| Secondary action  | default, pressed                 | import, template, cancel        | teal/outlined treatment                            |
| Class chip        | selected, unselected, grouped    | dashboard, class, attendance    | class identity and active-state contrast           |
| Status chip       | selected, unselected             | attendance                      | status text plus radio semantics                   |
| Student row       | normal, archived, reordered      | class, attendance, grades       | avatar, name, controls, note affordance            |
| Text field        | empty, focused, error, multiline | class, schedule, journal, notes | label, validation copy, scalable text              |
| Report filter     | kind, period, selected           | reports                         | preview scope and filename use same state          |
| Modal/dialog      | confirm, validation, recovery    | all write flows                 | cancel-first action order and explicit impact      |
| Empty/error state | empty, invalid, storage error    | imports, reports, backups       | actionable retry/help copy                         |

The native FigCraft source is `design/figcraft/kelasrapi.figcraft`; implementation-facing state and copy notes are in `design/figcraft/handoff.md`.
