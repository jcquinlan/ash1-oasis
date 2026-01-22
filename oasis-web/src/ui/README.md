# @oasis/ui

Isolated UI component library built with Radix UI primitives and CSS Modules.

## Philosophy

- **Simple**: No complex build tools or dependencies. Just React, Radix UI, and CSS Modules.
- **Isolated**: Designed to be extracted into a separate package at any time.
- **Accessible**: Built on Radix UI primitives for battle-tested accessibility.
- **Tasteful**: Clean, minimal design that works in light and dark modes.

## Components

### Card
A simple card container with border and shadow.

```tsx
import { Card } from '@oasis/ui'

<Card>
  <p>Card content</p>
</Card>
```

### Badge
Status badge with variants for different states.

```tsx
import { Badge } from '@oasis/ui'

<Badge variant="success">Running</Badge>
<Badge variant="error">Stopped</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="default">Default</Badge>
```

### ContainerItem
A list item for displaying containers or similar data.

```tsx
import { ContainerItem } from '@oasis/ui'

<ContainerItem>
  <span>Container Name</span>
  <Badge variant="success">Running</Badge>
</ContainerItem>
```

### Stat
Display a labeled statistic.

```tsx
import { Stat } from '@oasis/ui'

<Stat label="Uptime" value="3 days" />
<Stat label="Memory" value="42%" />
```

## Styling

Components use CSS Modules for styling, providing automatic scoping and preventing style conflicts. All components support dark mode via `@media (prefers-color-scheme: dark)`.

## Extending

To add new components:

1. Create a new folder in `components/`
2. Add `ComponentName.tsx` and `ComponentName.module.css`
3. Export from `index.ts`

## Future Extraction

This library is designed to be easily extracted into its own npm package. When ready:

1. Move this `ui/` folder to its own repository
2. Update import paths in the main application
3. Publish to npm or use as a local package
