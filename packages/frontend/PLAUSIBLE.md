# Plausible Analytics Setup

Plausible Analytics has been integrated using the official `@plausible-analytics/tracker` npm package.

## Quick Setup

### 1. Environment Variables

Set these environment variables to enable Plausible:

- **`VITE_PLAUSIBLE_DOMAIN`** (required): Your domain name (e.g., `dcsplan.example.com`)
- **`VITE_PLAUSIBLE_ENDPOINT`** (optional): Your Plausible CE API endpoint (e.g., `https://analytics.example.com/api/event`)

If `VITE_PLAUSIBLE_DOMAIN` is not set, Plausible will be disabled.

### 2. Local Development

Create a `.env` file in `packages/frontend/`:

```bash
VITE_PLAUSIBLE_DOMAIN=localhost
VITE_PLAUSIBLE_ENDPOINT=https://your-plausible-instance.com/api/event
```

### 3. Production Build

#### Docker

```bash
docker build \
  --build-arg VITE_PLAUSIBLE_DOMAIN=dcsplan.example.com \
  --build-arg VITE_PLAUSIBLE_ENDPOINT=https://analytics.example.com/api/event \
  -t dcsplan-frontend \
  -f packages/frontend/Dockerfile .
```

#### GitHub Actions

Add repository variables:
- `VITE_PLAUSIBLE_DOMAIN`
- `VITE_PLAUSIBLE_ENDPOINT`

Set in: **Repository Settings → Secrets and variables → Actions → Variables**

## Usage

### Automatic Page View Tracking

Page views are automatically tracked. No code needed!

### Custom Event Tracking

#### Using the React Hook

```tsx
import { usePlausible } from '../hooks/usePlausible';

function MyComponent() {
  const { trackEvent } = usePlausible();

  const handleClick = () => {
    trackEvent('ButtonClick', {
      props: { button: 'generate', method: 'zip' }
    });
  };

  return <button onClick={handleClick}>Generate</button>;
}
```

#### Using the Utility Function

```tsx
import { trackEvent } from '../utils/plausible';

trackEvent('CustomEvent', {
  props: { key: 'value' },
  revenue: { amount: 99.99, currency: 'USD' }
});
```

## Files

- `src/config/plausible.ts` - Configuration
- `src/utils/plausible.ts` - Initialization and tracking utilities
- `src/hooks/usePlausible.ts` - React hook for components
- `src/main.tsx` - Initializes Plausible on app startup

