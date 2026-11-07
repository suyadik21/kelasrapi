# KelasRapi Neumorphic UI Override

KelasRapi now uses a soft neumorphic direction: one cool-blue clay surface, restrained dual-depth cues, rounded controls, and a coral accent reserved for action and focus. The visual depth should support the teacher's task, never compete with attendance data.

## Tokens

- Base surface: `#EAF4FF`
- Inset surface: `#DDEBFA`
- Primary text: `#24354D`
- Muted text: `#687B91`
- Accent/CTA: `#FF795C`
- Accent pressed: `#E9684C`
- Highlight edge: `#FFFFFF`
- Shadow edge: `#B5C8DC`
- Card radius: `28`
- Control radius: `18–20`

The MVP ships in light mode. A future dark mode keeps the same semantic roles (surface, text, muted text, accent, confirmation) and swaps only their values; no screen may use raw black shadows or color-only status meaning.

## Interaction rules

- Keep the same base surface across screens; avoid white cards and black shadows.
- Raised surfaces use a light top/left edge, a darker lower edge, and low-opacity elevation.
- Pressed controls use a darker accent and a subtle 1dp translation without changing layout bounds.
- Status chips keep visible text labels and accessibility roles; color is not the only status signal.
- Use the coral accent for primary actions, selected navigation, focus, and recovery feedback only.
- Preserve 48dp minimum action targets, safe-area spacing, and readable text contrast.

## Scope

Apply this direction to dashboard, attendance, class, schedule, journal, report, and backup screens. Avoid blur-heavy shadows, noisy textures, and decorative gradients; they reduce legibility and add little value on small screens.
