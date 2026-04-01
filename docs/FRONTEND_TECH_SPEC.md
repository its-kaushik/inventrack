# Frontend Tech Spec — InvenTrack

| Field            | Detail                                                         |
| ---------------- | -------------------------------------------------------------- |
| **Document Version** | 1.0                                                        |
| **Date**         | 2026-04-01                                                     |
| **Parent Docs**  | BRD.md, FRONTEND_BRD.md, BACKEND_BRD.md, BACKEND_TECH_SPEC.md |
| **Status**       | Draft                                                          |

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Design Token Implementation](#3-design-token-implementation)
4. [Routing, Layouts & Guards](#4-routing-layouts--guards)
5. [State Management](#5-state-management)
6. [API Client & Data Fetching](#6-api-client--data-fetching)
7. [Authentication Flow](#7-authentication-flow)
8. [Role-Based UI](#8-role-based-ui)
9. [POS Implementation](#9-pos-implementation)
10. [Offline & PWA](#10-offline--pwa)
11. [Barcode Scanner Integration](#11-barcode-scanner-integration)
12. [Printing](#12-printing)
13. [Form Handling & Validation](#13-form-handling--validation)
14. [Component Architecture](#14-component-architecture)
15. [Charts & Data Visualization](#15-charts--data-visualization)
16. [Number & Currency Formatting](#16-number--currency-formatting)
17. [Testing Strategy](#17-testing-strategy)
18. [Build, Bundle & Deployment](#18-build-bundle--deployment)
19. [Performance Optimization](#19-performance-optimization)
20. [Accessibility Implementation](#20-accessibility-implementation)
21. [Development Workflow](#21-development-workflow)

---

## 1. Tech Stack

### 1.1 Core

| Layer               | Technology              | Version  | Justification                                                     |
| ------------------- | ----------------------- | -------- | ----------------------------------------------------------------- |
| **Framework**       | React                   | 19       | Industry standard, massive ecosystem, concurrent features (Suspense, transitions), team familiarity |
| **Language**        | TypeScript              | 5.5+     | Shared types with backend (same language), compile-time safety, self-documenting code |
| **Build Tool**      | Vite                    | 6.x      | Fast HMR, native ESM, excellent DX, tree-shaking, minimal config |
| **Routing**         | TanStack Router         | Latest   | Type-safe routes, file-based routing option, built-in search params, loader/action pattern for data fetching |
| **Server State**    | TanStack Query          | 5.x      | Caching, automatic revalidation, optimistic updates, background refetch, offline support via `persistQueryClient` |
| **Client State**    | Zustand                 | 5.x      | Minimal API, no boilerplate, perfect for POS cart state and auth. Avoids Redux/Context Provider complexity |
| **Styling**         | Tailwind CSS            | 4.x      | Utility-first, design token integration via `tailwind.config`, JIT compilation, responsive variants, mobile-first defaults |
| **UI Components**   | Shadcn/ui               | Latest   | Copy-paste component library (not a dependency). Accessible, composable, Tailwind-native. We own the code — can customize freely |
| **Forms**           | React Hook Form         | 7.x      | Performant (minimal re-renders), uncontrolled inputs, Zod integration for validation |
| **Validation**      | Zod                     | 3.x      | Same library as backend — shared schema definitions possible. Runtime validation matching API contracts |
| **Icons**           | Lucide React            | Latest   | Tree-shakeable, consistent stroke width, matches Frontend BRD icon spec |
| **Date Handling**   | date-fns                | 3.x      | Tree-shakeable (import only what you use), immutable, Indian date formatting |
| **Charts**          | Recharts                | 2.x      | React-native, responsive, composable. Good for dashboard donut/bar/line charts |
| **Barcode Scan**    | html5-qrcode            | Latest   | Camera-based barcode scanning fallback for mobile. Supports Code-128, EAN-13 |
| **PDF (client)**    | react-to-print          | Latest   | Print React components via browser print dialog. For receipts and labels |
| **Offline DB**      | Dexie.js                | 4.x      | IndexedDB wrapper with relational querying. Stores offline product catalog (2,000+ SKUs) and offline bill queue. Required for true offline POS — Workbox HTTP caching alone cannot handle uncached barcode lookups. See Section 10 |
| **PWA**             | vite-plugin-pwa         | Latest   | Service worker generation, precaching, offline support, install prompt |

### 1.2 Dev & Quality

| Tool                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| **Vitest**              | Unit and component testing (same config as Vite)           |
| **React Testing Library** | Component testing (user-centric, accessibility-first)    |
| **Playwright**          | E2E testing (cross-browser, mobile emulation)              |
| **MSW (Mock Service Worker)** | API mocking for tests and local dev without backend |
| **Storybook**           | Component development and visual documentation             |
| **ESLint**              | Linting (with eslint-plugin-react, jsx-a11y)               |
| **Prettier**            | Code formatting                                            |
| **Husky + lint-staged** | Pre-commit hooks                                           |

### 1.3 Why Not [Alternative]?

| Rejected        | Why                                                              |
| --------------- | ---------------------------------------------------------------- |
| Next.js         | SSR/SSG overhead unnecessary for this app. It's a SPA behind login — no SEO needed. Vite + React is simpler, faster to build, and easier to deploy as a static bundle |
| Redux           | Too much boilerplate for this app size. Zustand covers global state; TanStack Query covers server state. No need for Redux middleware complexity |
| Chakra UI / MUI | Dependency-heavy component libraries with opinionated styling. Shadcn/ui gives us the components without the dependency — we own the code |
| CSS Modules     | Doesn't scale as well as Tailwind for rapid UI development. No design token system built-in |
| Axios           | The native `fetch` API + a thin wrapper is sufficient. Avoids an extra dependency |
| Day.js/Moment   | date-fns is tree-shakeable and more modern                       |

---

## 2. Project Structure

```
apps/
└── web/                              # Frontend application
    ├── public/
    │   ├── manifest.json             # PWA manifest
    │   ├── sw.js                     # Service worker (generated by vite-plugin-pwa)
    │   └── icons/                    # PWA icons (192, 512)
    │
    ├── src/
    │   ├── main.tsx                  # Entry point — React root, providers
    │   ├── app.tsx                   # Router + layout mount
    │   │
    │   ├── config/
    │   │   ├── env.ts                # Vite env vars (VITE_API_URL, etc.)
    │   │   └── constants.ts          # App constants, default values
    │   │
    │   ├── routes/                   # Route definitions (1 file per page/group)
    │   │   ├── __root.tsx            # Root layout
    │   │   ├── _auth.tsx             # Auth layout (login, forgot password)
    │   │   ├── _app.tsx              # Authenticated layout (sidebar/bottom nav)
    │   │   ├── _app.index.tsx        # Dashboard (/)
    │   │   ├── _app.pos.tsx          # POS layout (full-screen, no nav shell)
    │   │   ├── _app.pos.index.tsx    # POS billing screen
    │   │   ├── _app.pos.bills.tsx    # Bill history
    │   │   ├── _app.pos.bills.$id.tsx # Bill detail
    │   │   ├── _app.inventory.tsx    # Inventory layout
    │   │   ├── _app.inventory.products.tsx
    │   │   ├── _app.inventory.products.$id.tsx
    │   │   ├── _app.inventory.products.new.tsx
    │   │   ├── _app.inventory.stock.tsx
    │   │   ├── _app.inventory.labels.tsx
    │   │   ├── _app.inventory.import.tsx
    │   │   ├── _app.purchases.tsx
    │   │   ├── _app.suppliers.tsx
    │   │   ├── _app.suppliers.$id.tsx
    │   │   ├── _app.customers.tsx
    │   │   ├── _app.customers.$id.tsx
    │   │   ├── _app.accounting.tsx
    │   │   ├── _app.reports.tsx
    │   │   ├── _app.settings.tsx
    │   │   └── ... (additional routes per screen)
    │   │
    │   ├── components/               # Shared, reusable components
    │   │   ├── ui/                   # Shadcn/ui primitives (Button, Input, Dialog, Sheet, etc.)
    │   │   ├── layout/
    │   │   │   ├── sidebar.tsx        # Desktop sidebar navigation
    │   │   │   ├── bottom-nav.tsx     # Mobile bottom tab bar
    │   │   │   ├── top-bar.tsx        # Mobile top bar (title + icons)
    │   │   │   ├── breadcrumb.tsx
    │   │   │   └── app-shell.tsx      # Combines sidebar/bottom-nav/top-bar based on breakpoint
    │   │   ├── data/
    │   │   │   ├── data-table.tsx     # Generic sortable/filterable table (desktop) / card list (mobile)
    │   │   │   ├── kpi-card.tsx
    │   │   │   ├── status-badge.tsx
    │   │   │   ├── amount.tsx         # Monospace, Indian numbering, ₹ prefix
    │   │   │   ├── ledger-row.tsx
    │   │   │   └── empty-state.tsx
    │   │   ├── form/
    │   │   │   ├── currency-input.tsx
    │   │   │   ├── qty-stepper.tsx
    │   │   │   ├── search-input.tsx
    │   │   │   ├── scanner-input.tsx  # With Scan Mode toggle
    │   │   │   ├── date-range-picker.tsx
    │   │   │   ├── multi-select-filter.tsx
    │   │   │   ├── image-upload.tsx
    │   │   │   └── form-stepper.tsx
    │   │   ├── feedback/
    │   │   │   ├── toast.tsx          # Uses Sonner (from shadcn)
    │   │   │   ├── offline-banner.tsx
    │   │   │   ├── sync-indicator.tsx
    │   │   │   ├── loading-skeleton.tsx
    │   │   │   └── confirm-dialog.tsx
    │   │   └── pos/
    │   │       ├── cart-item.tsx
    │   │       ├── cart-list.tsx
    │   │       ├── totals-bar.tsx
    │   │       ├── payment-modal.tsx
    │   │       ├── discount-sheet.tsx
    │   │       └── customer-quick-add.tsx
    │   │
    │   ├── features/                 # Feature-specific components (not shared)
    │   │   ├── dashboard/
    │   │   │   ├── owner-dashboard.tsx
    │   │   │   ├── salesperson-dashboard.tsx
    │   │   │   └── getting-started-checklist.tsx
    │   │   ├── products/
    │   │   │   ├── product-form.tsx
    │   │   │   ├── product-card.tsx
    │   │   │   └── bulk-import-preview.tsx
    │   │   ├── suppliers/
    │   │   ├── customers/
    │   │   ├── purchases/
    │   │   ├── accounting/
    │   │   ├── reports/
    │   │   │   └── report-viewer.tsx  # Shared report layout
    │   │   └── settings/
    │   │       └── setup-wizard/
    │   │
    │   ├── hooks/                    # Custom React hooks
    │   │   ├── use-auth.ts           # Auth state, login/logout, token refresh
    │   │   ├── use-tenant.ts         # Current tenant info, GST scheme, settings
    │   │   ├── use-role.ts           # Role check helpers (canViewCostPrice, canProcessReturn, etc.)
    │   │   ├── use-online.ts         # Network connectivity status
    │   │   ├── use-pos-cart.ts       # POS cart state access (from Zustand store)
    │   │   ├── use-keyboard-shortcut.ts # POS keyboard shortcuts with input-focus guard
    │   │   ├── use-scanner.ts        # Barcode scanner event handling
    │   │   ├── use-debounce.ts
    │   │   └── use-media-query.ts    # Responsive breakpoint detection
    │   │
    │   ├── stores/                   # Zustand stores (client-side state)
    │   │   ├── auth.store.ts         # User, tokens, login status
    │   │   ├── cart.store.ts         # POS cart items, discounts, held bills
    │   │   └── ui.store.ts           # Sidebar collapsed, scan mode, offline banner dismissed
    │   │
    │   ├── api/                      # API client layer
    │   │   ├── client.ts             # Fetch wrapper with auth, refresh, error handling
    │   │   ├── types.ts              # API response/request TypeScript types
    │   │   ├── auth.api.ts           # login, refresh, logout, forgotPassword, resetPassword
    │   │   ├── products.api.ts       # CRUD, search, import
    │   │   ├── bills.api.ts          # create, list, detail, print, sync
    │   │   ├── customers.api.ts
    │   │   ├── suppliers.api.ts
    │   │   ├── purchases.api.ts
    │   │   ├── stock.api.ts
    │   │   ├── cash-register.api.ts
    │   │   ├── dashboard.api.ts
    │   │   ├── reports.api.ts
    │   │   ├── settings.api.ts
    │   │   ├── labels.api.ts
    │   │   └── uploads.api.ts        # Presigned URL flow
    │   │
    │   ├── lib/                      # Pure utility functions
    │   │   ├── format-currency.ts    # ₹12,34,567.00 Indian formatting
    │   │   ├── format-date.ts        # DD-MM-YYYY, relative dates
    │   │   ├── gst.ts                # Client-side GST display helpers (not calculation — that's backend)
    │   │   ├── financial-year.ts     # FY detection, quarter helpers
    │   │   └── cn.ts                 # Tailwind class merge utility (clsx + tailwind-merge)
    │   │
    │   ├── types/                    # Shared TypeScript types
    │   │   ├── models.ts             # Product, Bill, Customer, Supplier, etc.
    │   │   ├── api.ts                # ApiResponse<T>, PaginatedResponse<T>, ApiError
    │   │   └── enums.ts              # UserRole, BillStatus, PaymentMode, etc.
    │   │
    │   └── styles/
    │       └── globals.css           # Tailwind directives, CSS custom properties, font imports
    │
    ├── index.html
    ├── tailwind.config.ts
    ├── vite.config.ts
    ├── tsconfig.json
    ├── package.json
    └── Dockerfile                    # Nginx serving static build
```

### 2.1 Key Conventions

- **`routes/`** = pages. Each file maps to a URL. Contains data-fetching loaders and minimal layout
- **`components/`** = shared across 2+ features. Organized by type (ui, data, form, feedback, pos, layout)
- **`features/`** = feature-specific components used by only one route group
- **`api/`** = thin API functions. Each returns typed data, never handles UI concerns
- **`stores/`** = client-only state (cart, auth, UI preferences). Server state stays in TanStack Query
- **`hooks/`** = reusable logic. Business-logic hooks reference stores and API layer
- Naming: `kebab-case` for files, `PascalCase` for components, `camelCase` for hooks/functions

---

## 3. Design Token Implementation

### 3.1 CSS Custom Properties (globals.css)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Primary — Indigo */
    --primary-50: 238 242 255;   /* #EEF2FF */
    --primary-100: 224 231 255;  /* #E0E7FF */
    --primary-200: 199 210 254;  /* #C7D2FE */
    --primary-500: 99 102 241;   /* #6366F1 */
    --primary-600: 79 70 229;    /* #4F46E5 */
    --primary-700: 67 56 202;    /* #4338CA */
    --primary-900: 49 46 129;    /* #312E81 */

    /* Accent — Amber */
    --accent-50: 255 251 235;
    --accent-100: 254 243 199;
    --accent-400: 251 191 36;
    --accent-500: 245 158 11;
    --accent-600: 217 119 6;

    /* Neutrals — Slate */
    --neutral-50: 248 250 252;
    --neutral-100: 241 245 249;
    --neutral-200: 226 232 240;
    --neutral-300: 203 213 225;
    --neutral-400: 148 163 184;
    --neutral-500: 100 116 139;
    --neutral-700: 51 65 85;
    --neutral-800: 30 41 59;
    --neutral-900: 15 23 42;

    /* Semantic */
    --success-500: 34 197 94;
    --success-700: 21 128 61;
    --warning-500: 245 158 11;
    --warning-700: 180 83 9;
    --error-500: 239 68 68;
    --error-700: 185 28 28;
    --info-500: 59 130 246;

    /* POS */
    --pos-cash: 34 197 94;
    --pos-upi: 139 92 246;
    --pos-card: 59 130 246;
  }

  /* Dark mode (future) — swap token values here */
  /* .dark { --primary-600: ...; } */
}
```

### 3.2 Tailwind Config Extension

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
        },
        accent: { /* same pattern */ },
        success: { 500: 'rgb(var(--success-500) / <alpha-value>)', 700: '...' },
        warning: { /* ... */ },
        error: { /* ... */ },
        info: { /* ... */ },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')], // for shadcn animations
} satisfies Config;
```

Usage: `bg-primary-600`, `text-error-500`, `font-mono` — all tokens accessible via Tailwind classes. Dark mode is a single CSS variable swap.

---

## 4. Routing, Layouts & Guards

### 4.1 Layout Hierarchy

```
__root.tsx                    ← Error boundary, Providers (Query, Zustand)
├── _auth.tsx                 ← Centered card layout (no nav). Redirect to / if logged in
│   ├── login.tsx
│   ├── forgot-password.tsx
│   └── reset-password.tsx
│
├── _app.tsx                  ← Authenticated shell (sidebar/bottom-nav). Redirect to /login if not authenticated
│   ├── index.tsx             ← Dashboard (role-dependent content)
│   ├── pos.tsx               ← POS layout (full-screen, NO sidebar/bottom-nav)
│   │   ├── pos.index.tsx     ← POS billing screen
│   │   ├── pos.bills.tsx     ← Bill history
│   │   └── pos.bills.$id.tsx ← Bill detail
│   ├── inventory.tsx         ← Inventory sub-nav
│   │   ├── products.tsx
│   │   ├── stock.tsx
│   │   └── labels.tsx
│   ├── suppliers.tsx
│   ├── customers.tsx
│   ├── accounting.tsx
│   ├── reports.tsx
│   ├── settings.tsx
│   └── setup.tsx             ← Setup wizard (also no nav shell, full-screen)
```

### 4.2 Auth Guard

```typescript
// routes/_app.tsx
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
    if (!context.auth.tenant.setupComplete && location.pathname !== '/setup') {
      throw redirect({ to: '/setup' });
    }
  },
  component: AppLayout,
});
```

### 4.3 Role Guard

```typescript
// Reusable guard helper
function requireRole(allowedRoles: UserRole[]) {
  return ({ context }: { context: AppContext }) => {
    if (!allowedRoles.includes(context.auth.role)) {
      throw redirect({ to: '/' });
    }
  };
}

// Usage: settings only for owner
export const Route = createFileRoute('/_app/settings')({
  beforeLoad: requireRole(['owner']),
});
```

### 4.4 POS Layout (Special)

The POS route renders a **full-screen layout** — no sidebar, no bottom nav, no breadcrumbs. It has its own minimal top bar with back button, hold, and recall. This maximizes screen real estate for the cart.

```typescript
// routes/_app.pos.tsx
function PosLayout() {
  return (
    <div className="h-dvh flex flex-col bg-neutral-50">
      {/* POS uses full dynamic viewport height, no nav shell */}
      <Outlet />
    </div>
  );
}
```

---

## 5. State Management

### 5.1 State Categories

| Category       | Tool            | What Lives Here                                           |
| -------------- | --------------- | --------------------------------------------------------- |
| **Server state** | TanStack Query | Products, bills, customers, suppliers, dashboard data, reports — anything from the API |
| **Auth state** | Zustand (`auth.store`) | User object, access token, role, tenant info, isAuthenticated flag |
| **Cart state** | Zustand (`cart.store`) | POS cart items, discounts, held bills queue, selected customer |
| **UI state**   | Zustand (`ui.store`)   | Sidebar collapsed, scan mode on/off, offline banner dismissed, current register ID |

### 5.2 Cart Store (POS)

```typescript
// src/stores/cart.store.ts
interface CartItem {
  productId: string;
  product: ProductSnapshot; // name, sku, size, sellingPrice, catalogDiscountPct, gstRate
  quantity: number;
  lineTotal: number;
}

interface CartStore {
  items: CartItem[];
  customerId: string | null;
  additionalDiscountAmount: number;
  additionalDiscountPct: number;

  // Actions
  addItem: (product: Product) => void;  // add or increment qty
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  setCustomer: (id: string | null) => void;
  setAdditionalDiscount: (amount: number, pct: number) => void;
  clear: () => void;

  // Computed (via selectors)
  subtotal: () => number;
  catalogDiscountTotal: () => number;
  netAmount: () => number;
  itemCount: () => number;
}
```

**Why Zustand for the cart instead of TanStack Query:** The cart is purely client-side state that doesn't exist on the server until the bill is created. It needs synchronous, instant updates when scanning barcodes. TanStack Query is for server-synchronized data.

### 5.3 TanStack Query Keys Convention

```typescript
// Hierarchical key structure for targeted invalidation
export const queryKeys = {
  products: {
    all:    (tenantId: string) => ['products', tenantId] as const,
    list:   (tenantId: string, filters: Filters) => ['products', tenantId, 'list', filters] as const,
    detail: (tenantId: string, id: string) => ['products', tenantId, id] as const,
    search: (tenantId: string, query: string) => ['products', tenantId, 'search', query] as const,
  },
  bills: {
    all:    (tenantId: string) => ['bills', tenantId] as const,
    list:   (tenantId: string, filters: Filters) => ['bills', tenantId, 'list', filters] as const,
    detail: (tenantId: string, id: string) => ['bills', tenantId, id] as const,
  },
  dashboard: (tenantId: string) => ['dashboard', tenantId] as const,
  // ... same pattern for all entities
};

// Invalidation after bill creation:
queryClient.invalidateQueries({ queryKey: queryKeys.bills.all(tenantId) });
queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(tenantId) });
queryClient.invalidateQueries({ queryKey: queryKeys.products.all(tenantId) }); // stock changed
```

---

## 6. API Client & Data Fetching

### 6.1 Fetch Wrapper

```typescript
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_URL + '/api/v1';

export async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const authStore = useAuthStore.getState();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authStore.accessToken && { Authorization: `Bearer ${authStore.accessToken}` }),
      ...options.headers,
    },
    credentials: 'include', // send refresh token cookie
  });

  // Token expired — attempt silent refresh
  if (res.status === 401 && authStore.accessToken) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      // Retry the original request with new token
      return apiClient<T>(path, options);
    }
    // Refresh failed — logout
    authStore.logout();
    throw new AuthError('Session expired');
  }

  const json = await res.json();

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, json.error.details, res.status);
  }

  return json;
}
```

### 6.2 API Function Pattern

```typescript
// src/api/products.api.ts
export function listProducts(filters: ProductFilters) {
  const params = new URLSearchParams();
  if (filters.categoryId) params.set('category_id', filters.categoryId);
  if (filters.search) params.set('search', filters.search);
  params.set('limit', String(filters.limit ?? 20));
  if (filters.cursor) params.set('cursor', filters.cursor);

  return apiClient<PaginatedResponse<Product>>(`/products?${params}`);
}

export function searchProducts(query: string) {
  return apiClient<Product[]>(`/products/search?q=${encodeURIComponent(query)}`);
}

export function createBill(input: CreateBillInput) {
  return apiClient<Bill>('/bills', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

### 6.3 Query Hook Pattern

```typescript
// In a route or component
function ProductListPage() {
  const { tenantId } = useTenant();
  const [filters, setFilters] = useState<ProductFilters>({});

  const { data, isLoading, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: queryKeys.products.list(tenantId, filters),
    queryFn: ({ pageParam }) => listProducts({ ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
  });

  // ...
}
```

### 6.4 Mutation Pattern (Bill Creation)

```typescript
function useBillCreate() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const cart = useCartStore();

  return useMutation({
    mutationFn: (input: CreateBillInput) => createBill(input),
    onSuccess: (data) => {
      cart.clear();
      toast.success(`Bill ${data.data.billNumber} created`);

      // Invalidate affected queries
      queryClient.invalidateQueries({ queryKey: queryKeys.bills.all(tenantId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(tenantId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all(tenantId) });
    },
    onError: (err: ApiError) => {
      if (err.code === 'DISCOUNT_LIMIT_EXCEEDED') {
        toast.error('Discount exceeds your limit. Ask a manager to approve.');
      } else if (err.code === 'PAYMENT_UNBALANCED') {
        toast.error('Payment amounts do not match the bill total.');
      } else {
        toast.error(err.message);
      }
    },
  });
}
```

---

## 7. Authentication Flow

### 7.1 Login → Token Storage → Auto-Refresh

```
[Login Page]
    │
    │── POST /auth/login { phone, password }
    │
    │── Response: { accessToken, user: { id, name, role, tenant } }
    │   + Set-Cookie: refreshToken (httpOnly, Secure, SameSite=Strict)
    │
    │── Store in Zustand (auth.store):
    │     accessToken (in memory only — NOT localStorage)
    │     user object
    │     tenant object (includes gstScheme, settings)
    │
    │── Redirect to / (dashboard) or /setup (if !tenant.setupComplete)
    │
[App Running]
    │
    │── Every API call: Authorization: Bearer <accessToken>
    │
    │── On 401 response: silently call POST /auth/refresh (cookie sent automatically)
    │     ├── Success: update accessToken in Zustand, retry failed request
    │     └── Failure: clear auth store, redirect to /login
    │
[Tab Close / Refresh]
    │
    │── accessToken lost (memory only)
    │── On app load: call POST /auth/refresh (cookie still valid for 7 days)
    │     ├── Success: restore session seamlessly
    │     └── Failure: redirect to /login
```

**Security:** Access token is stored in memory (Zustand) only — never in `localStorage` or `sessionStorage`. This protects against XSS token theft. The refresh token is in an `httpOnly` cookie, inaccessible to JavaScript.

---

## 8. Role-Based UI

### 8.1 Hook

```typescript
// src/hooks/use-role.ts
export function useRole() {
  const { user } = useAuthStore();
  const role = user?.role ?? 'salesperson';

  return {
    role,
    isOwner: role === 'owner',
    isManager: role === 'manager',
    isSalesperson: role === 'salesperson',
    canViewCostPrice: role !== 'salesperson',
    canProcessReturn: role !== 'salesperson',
    canManageSettings: role === 'owner',
    canManageUsers: role === 'owner',
    canManageStock: role !== 'salesperson',
    canViewPnL: role === 'owner',
    canDeleteProducts: role === 'owner',
  };
}
```

### 8.2 Usage Patterns

```tsx
// Conditionally show cost price
function ProductDetail({ product }: Props) {
  const { canViewCostPrice } = useRole();
  return (
    <dl>
      <dt>Selling Price</dt>
      <dd><Amount value={product.sellingPrice} /></dd>
      {canViewCostPrice && (
        <>
          <dt>Cost Price</dt>
          <dd><Amount value={product.costPrice} /></dd>
        </>
      )}
    </dl>
  );
}

// Conditionally render nav items
function Sidebar() {
  const { canManageSettings, canViewPnL } = useRole();
  return (
    <nav>
      <NavItem to="/" icon={Home} label="Dashboard" />
      <NavItem to="/pos" icon={ShoppingCart} label="POS" />
      {/* Settings only visible to owner */}
      {canManageSettings && <NavItem to="/settings" icon={Settings} label="Settings" />}
    </nav>
  );
}
```

---

## 9. POS Implementation

### 9.1 Cart State Flow

```
[Barcode Scan / Product Search / Manual Entry]
     │
     ▼
cartStore.addItem(product)  ← Zustand (synchronous, instant)
     │
     ▼
[Cart UI re-renders with new item]  ← React subscription to Zustand
     │
     ▼
[User taps PAY]
     │
     ▼
[Payment Modal: split Cash/UPI/Card, select customer]
     │
     ▼
[Complete Sale] → billsApi.createBill({
  items: cartStore.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
  payments: [{ mode: 'cash', amount: 800 }, { mode: 'upi', amount: 500 }],
  customerId: cartStore.customerId,
  additionalDiscountAmount: cartStore.additionalDiscountAmount,
  clientId: crypto.randomUUID(),  // for offline idempotency
})
     │
     ▼
[Success] → cart.clear() → navigate to /pos/bill/:id (print preview)
```

### 9.2 Keyboard Shortcut Implementation

```typescript
// src/hooks/use-keyboard-shortcut.ts
export function useKeyboardShortcut(key: string, callback: () => void, options?: { allowInInput?: boolean }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Suppress F1-F8 when a text input is focused (Frontend BRD requirement)
      if (!options?.allowInInput) {
        const tag = (e.target as HTMLElement)?.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
        if (isInput) return;
      }

      if (e.key === key) {
        e.preventDefault();
        callback();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, options?.allowInInput]);
}

// Usage in POS:
useKeyboardShortcut('F1', () => scanInputRef.current?.focus());
useKeyboardShortcut('F2', () => setPaymentModalOpen(true));
useKeyboardShortcut('F3', () => holdCurrentBill());
useKeyboardShortcut('Escape', () => closeModal(), { allowInInput: true });
```

### 9.3 Sound & Haptic Feedback

```typescript
// src/lib/feedback.ts
const scanSound = new Audio('/sounds/scan-beep.mp3');
scanSound.preload = 'auto';

export function playScanFeedback() {
  scanSound.currentTime = 0;
  scanSound.play().catch(() => {}); // ignore autoplay restrictions

  if (navigator.vibrate) {
    navigator.vibrate(50); // 50ms haptic on mobile
  }
}
```

---

## 10. Offline & PWA

### 10.1 Service Worker Strategy (App Shell Only)

Workbox/VitePWA handles **app shell precaching only** — JS, CSS, HTML, fonts, icons. It does NOT handle product search or POS data caching. That's handled by the local IndexedDB catalog (Section 10.2).

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Precache app shell only — NO API runtime caching
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // API data is handled by IndexedDB, not Workbox
      },
      manifest: {
        name: 'InvenTrack',
        short_name: 'InvenTrack',
        theme_color: '#4F46E5',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/pos',
      },
    }),
  ],
});
```

**Why NOT use Workbox for API caching:** Workbox caches exact URL query strings. If the POS goes offline and a salesperson scans a barcode they haven't searched recently, Workbox returns a network error — the exact URL was never cached. For true offline POS, we need a local product catalog in IndexedDB.

### 10.2 Local Product Catalog (Dexie.js + IndexedDB)

The POS must function offline for barcode lookups and product search. This requires a full local copy of the active product catalog in IndexedDB.

```typescript
// src/db/offline-db.ts
import Dexie, { type Table } from 'dexie';

interface OfflineProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  size: string | null;
  sellingPrice: number;
  costPrice: number;  // excluded for salesperson sync
  catalogDiscountPct: number;
  gstRate: number;
  categoryId: string;
  brandId: string | null;
  currentStock: number;
  isActive: boolean;
}

interface OfflineBill {
  clientId: string;
  offlineCreatedAt: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  payments: { mode: string; amount: number }[];
  customerId: string | null;
  additionalDiscountAmount: number;
  synced: boolean;
}

class InvenTrackDB extends Dexie {
  products!: Table<OfflineProduct, string>;
  offlineBills!: Table<OfflineBill, string>;

  constructor() {
    super('inventrack-offline');
    this.version(1).stores({
      products: 'id, sku, barcode, name, categoryId, brandId, isActive',
      offlineBills: 'clientId, synced',
    });
  }
}

export const offlineDb = new InvenTrackDB();
```

#### Catalog Sync Strategy

```typescript
// src/lib/catalog-sync.ts
import { offlineDb } from '../db/offline-db';

/**
 * Full catalog sync: downloads all active products and replaces local IndexedDB.
 * Called on:
 *   - First login / app load (if catalog is empty or stale)
 *   - Every 5 minutes in background (while online)
 *   - Manually via "Sync Catalog" button in POS (if user suspects stale data)
 */
export async function syncProductCatalog() {
  try {
    // Fetch all active products from API (paginated — loop until exhausted)
    let cursor: string | undefined;
    const allProducts: OfflineProduct[] = [];

    do {
      const params = new URLSearchParams({ limit: '500', is_active: 'true' });
      if (cursor) params.set('cursor', cursor);
      const res = await apiClient<PaginatedResponse<OfflineProduct>>(`/products?${params}`);
      allProducts.push(...res.data);
      cursor = res.meta?.cursor ?? undefined;
    } while (cursor);

    // Atomic replace: clear + bulk insert inside a transaction
    await offlineDb.transaction('rw', offlineDb.products, async () => {
      await offlineDb.products.clear();
      await offlineDb.products.bulkAdd(allProducts);
    });

    console.info(`Catalog synced: ${allProducts.length} products`);
  } catch (err) {
    console.warn('Catalog sync failed (offline?)', err);
    // Silently fail — existing local catalog remains usable
  }
}
```

#### Offline Product Lookup (POS)

```typescript
// src/hooks/use-product-search.ts
export function useProductSearch() {
  const isOnline = useOnline();

  async function searchByBarcode(barcode: string): Promise<OfflineProduct | null> {
    if (isOnline) {
      // Online: hit API for freshest data
      try {
        const res = await searchProducts(barcode);
        return res.data[0] ?? null;
      } catch {
        // API failed — fall through to offline
      }
    }
    // Offline (or API failed): query local IndexedDB
    return offlineDb.products.where('barcode').equals(barcode).first() ?? null;
  }

  async function searchByName(query: string): Promise<OfflineProduct[]> {
    if (isOnline) {
      try {
        const res = await searchProducts(query);
        return res.data;
      } catch { /* fall through */ }
    }
    // Offline: fuzzy search on local catalog
    const lower = query.toLowerCase();
    return offlineDb.products
      .where('isActive').equals(1)
      .filter(p => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower))
      .limit(20)
      .toArray();
  }

  return { searchByBarcode, searchByName };
}
```

### 10.2.1 First Sync UX

The initial catalog sync (2,000+ products via paginated API → IndexedDB bulk insert) can take 2–4 seconds on a slow 4G connection. During this window, barcode scans or searches will hit an empty local DB.

**Implementation requirements:**

```typescript
// src/lib/catalog-sync.ts (extended)
export const catalogSyncState = {
  status: 'idle' as 'idle' | 'syncing' | 'ready' | 'error',
  lastSyncAt: null as Date | null,
  productCount: 0,
};

// Expose as a Zustand slice or a simple observable
// so the POS UI and top bar can subscribe to it
```

```tsx
// Top bar shows a non-blocking indicator during sync
function CatalogSyncIndicator() {
  const syncStatus = useCatalogSyncStatus(); // subscribes to catalogSyncState
  if (syncStatus === 'syncing') {
    return (
      <div className="flex items-center gap-1 text-xs text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing catalog...
      </div>
    );
  }
  return null;
}
```

```typescript
// In useProductSearch — handle "catalog not ready yet" gracefully
async function searchByBarcode(barcode: string): Promise<OfflineProduct | null> {
  if (isOnline) {
    try {
      const res = await searchProducts(barcode);
      return res.data[0] ?? null;
    } catch { /* fall through to offline */ }
  }

  // Check if local catalog has been synced at least once
  const count = await offlineDb.products.count();
  if (count === 0) {
    // Catalog not synced yet — don't return "not found", tell the user to wait
    throw new CatalogNotReadyError('Offline catalog is still loading. Please wait a moment and try again.');
  }

  return offlineDb.products.where('barcode').equals(barcode).first() ?? null;
}
```

The POS catches `CatalogNotReadyError` and shows a friendly toast ("Loading offline catalog, please wait...") instead of the misleading "Product not found".

### 10.3 Offline Bill Queue

```typescript
// src/lib/offline-bills.ts
import { offlineDb } from '../db/offline-db';

export async function queueOfflineBill(bill: Omit<OfflineBill, 'synced'>) {
  await offlineDb.offlineBills.add({ ...bill, synced: false });
}

export async function syncOfflineBills() {
  const pending = await offlineDb.offlineBills.where('synced').equals(0).toArray();
  if (pending.length === 0) return;

  const response = await billsApi.syncBills(pending);

  // Mark synced bills
  const syncedIds = response.data.synced.map(s => s.client_id);
  await offlineDb.offlineBills.where('clientId').anyOf(syncedIds).modify({ synced: true });

  // Clean up synced bills (keep conflicts for review)
  await offlineDb.offlineBills.where('synced').equals(1).delete();

  // Show result
  if (response.data.conflicts.length === 0) {
    toast.success(`${response.data.synced.length} bills synced`);
  } else {
    toast.warning(`${response.data.synced.length} synced, ${response.data.conflicts.length} need review`);
  }
}

export async function getPendingBillCount(): Promise<number> {
  return offlineDb.offlineBills.where('synced').equals(0).count();
}
```

### 10.4 Network Status Hook

```typescript
// src/hooks/use-online.ts
export function useOnline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); syncOfflineBills(); };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

### 10.5 Catalog Sync Schedule

| Trigger                        | Action                                                |
| ------------------------------ | ----------------------------------------------------- |
| App loads (online)             | Sync catalog if local DB is empty or `lastSync > 5min` |
| Every 5 minutes (background)   | Silent catalog re-sync (while online)                 |
| POS screen mounts              | Check `lastSync` — warn if stale (> 30 min)          |
| Manual "Sync" button in POS    | Force full catalog sync                               |
| Product created/edited (by this user) | Immediately update local DB entry            |
| Going offline                  | No action — local catalog is already populated        |

---

## 11. Barcode Scanner Integration

### 11.1 Scanner Hook Implementation

The hook supports two detection strategies, in priority order:

1. **Prefix/Suffix mode** (preferred): scanner is configured to send a prefix character (e.g., `~`) before the barcode and Enter (`\n`) after. The hook captures everything between prefix and suffix. This is the most reliable method.
2. **Timer-based fallback**: if no prefix is configured, the hook uses keystroke timing to distinguish scanner input (rapid burst < 50ms between characters) from human typing (slow, > 150ms gaps). This works for most scanners but can fail on slow Android devices or scanners with non-standard timing.

**Hardware setup note:** during deployment, configure all physical barcode scanners to append Enter (suffix) and, if supported, a prefix character (e.g., `~`). Most scanners support this via a programming barcode in their manual. This makes detection bulletproof.

```typescript
// src/hooks/use-scanner.ts
interface ScannerOptions {
  prefix?: string;        // e.g., '~' — configured on the physical scanner
  minLength?: number;     // minimum barcode length to accept (default: 4)
  maxKeystrokeGap?: number; // ms between keystrokes before buffer resets (default: 80)
}

export function useScanner(onScan: (barcode: string) => void, options: ScannerOptions = {}) {
  const { prefix, minLength = 4, maxKeystrokeGap = 80 } = options;
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const capturingRef = useRef(false); // true when prefix detected (prefix mode)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // --- Strategy 1: Prefix/Suffix mode ---
      if (prefix) {
        if (e.key === prefix && !capturingRef.current) {
          // Prefix detected: start capturing
          e.preventDefault();
          capturingRef.current = true;
          bufferRef.current = '';
          return;
        }

        if (capturingRef.current) {
          if (e.key === 'Enter') {
            // Suffix (Enter): submit the captured barcode
            e.preventDefault();
            if (bufferRef.current.length >= minLength) {
              onScan(bufferRef.current);
            }
            bufferRef.current = '';
            capturingRef.current = false;
            return;
          }

          // Accumulate barcode characters
          if (e.key.length === 1) {
            bufferRef.current += e.key;
          }
          return;
        }
        // Not capturing and not prefix — let the event pass through normally
        return;
      }

      // --- Strategy 2: Timer-based fallback (no prefix configured) ---
      if (e.key === 'Enter' && bufferRef.current.length >= minLength) {
        e.preventDefault();
        onScan(bufferRef.current);
        bufferRef.current = '';
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Reset buffer if gap between keystrokes is too long (human typing, not scanner)
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { bufferRef.current = ''; }, maxKeystrokeGap);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [onScan, prefix, minLength, maxKeystrokeGap]);
}

// Usage:
// With prefix-configured scanner (most reliable):
useScanner(handleBarcodeScan, { prefix: '~' });

// Without prefix (timer fallback):
useScanner(handleBarcodeScan);
```

### 11.2 Camera Fallback (Mobile)

```typescript
// src/components/form/camera-scanner.tsx
import { Html5QrcodeScanner } from 'html5-qrcode';

function CameraScanner({ onScan, onClose }: Props) {
  const scannerRef = useRef<Html5QrcodeScanner>();

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner('scanner-region', {
      fps: 10,
      qrbox: { width: 250, height: 100 },
      formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13],
    }, false);

    scannerRef.current.render(
      (decodedText) => { onScan(decodedText); onClose(); },
      () => {} // ignore errors (no barcode in frame)
    );

    // Cleanup: robust camera release
    // html5-qrcode accesses the device camera stream directly. If the component
    // unmounts unexpectedly (e.g., user hits browser Back mid-scan), the library's
    // .clear() may not resolve in time, leaving the camera light on.
    // We forcibly stop all active media tracks as a safety net.
    return () => {
      try {
        scannerRef.current?.clear();
      } catch {
        // .clear() failed — force-stop camera
      } finally {
        // Nuclear fallback: stop ALL active video tracks on the page.
        // This ensures the camera light turns off even if the library cleanup fails.
        document.querySelectorAll('video').forEach((video) => {
          const stream = video.srcObject as MediaStream | null;
          stream?.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        });
      }
    };
  }, []);

  return <div id="scanner-region" />;
}
```

---

## 12. Printing

### 12.1 Receipt Printing Strategy

| Device        | Method                                                   |
| ------------- | -------------------------------------------------------- |
| Desktop + USB printer | `window.print()` with a print-specific CSS stylesheet. `@media print` hides everything except the receipt component |
| Desktop + network printer | Same as above — OS print dialog routes to network printer |
| Mobile + WiFi printer | `window.print()` — Android Chrome supports WiFi printer selection in print dialog |
| Mobile fallback | Generate receipt as image/PDF → share via OS share sheet |

### 12.2 Receipt Component

```tsx
// src/components/pos/bill-receipt.tsx
function BillReceipt({ bill, tenant }: Props) {
  const isComposition = bill.gstSchemeAtSale === 'composition';

  return (
    <div className="print-receipt font-mono text-xs w-[80mm]">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-sm font-bold">{tenant.name}</h1>
        <p>{tenant.address}</p>
        <p>GSTIN: {tenant.gstin} | Ph: {tenant.phone}</p>
        {isComposition && (
          <p className="text-[10px] mt-1 font-bold">
            Composition taxable person, not eligible to collect tax on supplies
          </p>
        )}
      </div>

      <hr className="border-dashed my-1" />

      {/* Bill info */}
      <p>{isComposition ? 'Bill of Supply' : 'Tax Invoice'}: {bill.billNumber}</p>
      <p>Date: {formatDate(bill.createdAt)} | {formatTime(bill.createdAt)}</p>

      <hr className="border-dashed my-1" />

      {/* Items */}
      <table className="w-full">
        <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
        <tbody>
          {bill.items.map(item => (
            <tr key={item.id}>
              <td>{item.productName} {item.size && `- ${item.size}`}</td>
              <td className="text-right">{item.quantity}</td>
              <td className="text-right">{formatCurrency(item.unitPrice)}</td>
              <td className="text-right">{formatCurrency(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <hr className="border-dashed my-1" />
      <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(bill.subtotal)}</span></div>
      {bill.catalogDiscountTotal > 0 && (
        <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(bill.catalogDiscountTotal)}</span></div>
      )}
      {bill.additionalDiscountAmount > 0 && (
        <div className="flex justify-between"><span>Adj. Discount</span><span>-{formatCurrency(bill.additionalDiscountAmount)}</span></div>
      )}
      <div className="flex justify-between font-bold text-sm mt-1">
        <span>Net Payable</span><span>{formatCurrency(bill.netAmount)}</span>
      </div>

      {/* GST summary (Regular only) */}
      {!isComposition && bill.taxAmount > 0 && (
        <p className="text-[10px] mt-1">(Incl. GST: {formatCurrency(bill.taxAmount)})</p>
      )}

      {/* Payment modes */}
      <hr className="border-dashed my-1" />
      {bill.payments.map(p => (
        <div key={p.id} className="flex justify-between">
          <span>{p.mode.toUpperCase()}</span><span>{formatCurrency(p.amount)}</span>
        </div>
      ))}
    </div>
  );
}
```

### 12.3 Print CSS

```css
@media print {
  body > *:not(.print-container) { display: none !important; }
  .print-container { display: block !important; }
  .print-receipt { width: 80mm; margin: 0; padding: 2mm; }
  @page { size: 80mm auto; margin: 0; }
}
```

---

## 13. Form Handling & Validation

### 13.1 Pattern: React Hook Form + Zod

```typescript
// src/features/products/product-form.tsx
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  categoryId: z.string().uuid('Select a category'),
  brandId: z.string().uuid().optional(),
  sku: z.string().min(1).max(50),
  sellingPrice: z.number().positive('Price must be positive'),
  costPrice: z.number().min(0),
  gstRate: z.number().min(0).max(100),
  catalogDiscountPct: z.number().min(0).max(100).default(0),
  minStockLevel: z.number().int().min(0).default(10),
  hsnCode: z.string().max(8).optional(),
  size: z.string().optional(),
  color: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

function ProductForm({ defaultValues, onSubmit }: Props) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="name" control={form.control} render={({ field }) => (
          <FormItem>
            <FormLabel>Product Name</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {/* ... more fields ... */}
        <Button type="submit" disabled={form.formState.isSubmitting}>Save Product</Button>
      </form>
    </Form>
  );
}
```

### 13.2 File Upload (Presigned URL)

```typescript
// src/api/uploads.api.ts
export async function uploadFile(file: File, purpose: string): Promise<string> {
  // Step 1: Get presigned URL
  const { data } = await apiClient<{ url: string; key: string }>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType: file.type, purpose }),
  });

  // Step 2: Upload directly to S3
  await fetch(data.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

  // Step 3: Return the S3 key (saved with the entity)
  return data.key;
}
```

---

## 14. Component Architecture

### 14.1 Data Table (Responsive)

The `DataTable` component renders a **table on desktop** and a **card list on mobile**, sharing the same data and configuration.

```tsx
// src/components/data/data-table.tsx
interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  sortable?: boolean;
  hideOnMobile?: boolean;  // column hidden in card view
}

function DataTable<T>({ columns, data, onRowClick, isLoading }: Props<T>) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isLoading) return <LoadingSkeleton rows={10} />;
  if (data.length === 0) return <EmptyState />;

  return isMobile
    ? <CardList columns={columns} data={data} onRowClick={onRowClick} />
    : <Table columns={columns} data={data} onRowClick={onRowClick} />;
}
```

### 14.2 Amount Display

```tsx
// src/components/data/amount.tsx
function Amount({ value, className }: { value: number; className?: string }) {
  const formatted = formatIndianCurrency(value);
  const isNegative = value < 0;

  return (
    <span className={cn(
      'font-mono tabular-nums text-right',
      isNegative && 'text-error-500',
      className
    )}>
      {formatted}
    </span>
  );
}
```

---

## 15. Charts & Data Visualization

| Chart                 | Library   | Component            | Where Used                    |
| --------------------- | --------- | -------------------- | ----------------------------- |
| Payment Mode Split    | Recharts  | `<PieChart>`         | Dashboard                     |
| Sales Trend (7 days)  | Recharts  | `<BarChart>`         | Dashboard                     |
| P&L Breakdown         | Recharts  | `<BarChart>` stacked | P&L report                    |
| Sales Over Time       | Recharts  | `<LineChart>`        | Sales Overview                |

All charts use the design token colors (primary, accent, success, etc.) and are wrapped in `<ResponsiveContainer>` for auto-sizing.

---

## 16. Number & Currency Formatting

```typescript
// src/lib/format-currency.ts
const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatIndianCurrency(value: number): string {
  return INR.format(value); // "₹12,34,567.00"
}

// For compact display (dashboard KPIs)
export function formatCompact(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return formatIndianCurrency(value);
}
```

**Note:** `Intl.NumberFormat('en-IN')` natively supports Indian numbering (lakhs and crores). No custom logic needed.

---

## 17. Testing Strategy

### 17.1 Test Pyramid

| Layer             | Tool                    | Scope                                       | Count Target |
| ----------------- | ----------------------- | ------------------------------------------- | ------------ |
| **Unit**          | Vitest                  | Pure functions: formatCurrency, GST display helpers, cart store logic, role helpers | 50% |
| **Component**     | Vitest + RTL            | Individual components: Amount, StatusBadge, CartItem, PaymentModal. Mock API via MSW | 35% |
| **E2E**           | Playwright              | Critical user flows: login → POS → create bill → view bill. Cross-browser | 15% |

### 17.2 Critical Flows to E2E Test

- Login → dashboard loads correct role-dependent content
- POS: add items via search → apply discount → split payment → complete sale → bill preview
- POS: salesperson exceeds discount limit → gets error
- Customer creation during POS flow (quick-add)
- Product CRUD: create → appears in list → edit → archive
- Customer khata: credit sale → payment recording → balance update
- Responsive: POS usable on 360px viewport (Playwright mobile emulation)

### 17.3 MSW for API Mocking

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/products/search', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    return HttpResponse.json({
      success: true,
      data: mockProducts.filter(p => p.name.toLowerCase().includes(q?.toLowerCase() ?? '')),
    });
  }),

  http.post('/api/v1/bills', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      success: true,
      data: { id: 'new-bill-id', billNumber: 'KVB-2026-00001', ...body },
    });
  }),
];
```

---

## 18. Build, Bundle & Deployment

### 18.1 Build

```bash
# Development
npm run dev          # Vite dev server with HMR

# Production build
npm run build        # TypeScript check + Vite build → dist/
npm run preview      # Preview production build locally
```

### 18.2 Dockerfile

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 18.3 Nginx Config (SPA)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # No cache for index.html (so new deployments are picked up)
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

---

## 19. Performance Optimization

### 19.1 Bundle Splitting

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-router': ['@tanstack/react-router'],
          'vendor-charts': ['recharts'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
```

### 19.2 Lazy Loading Routes

```typescript
// All non-critical routes are lazy loaded
const PosPage = lazy(() => import('./routes/_app.pos.index'));
const ReportsPage = lazy(() => import('./routes/_app.reports'));
const SettingsPage = lazy(() => import('./routes/_app.settings'));
```

Only the login page and dashboard are in the initial bundle. POS, reports, settings, and all other routes load on first navigation.

### 19.3 POS-Specific Optimizations

| Optimization                  | Implementation                                              |
| ----------------------------- | ----------------------------------------------------------- |
| Product search debounce       | 300ms debounce on keystroke, avoids API spam                |
| Product catalog pre-fetch     | On POS mount, prefetch top 100 products into TanStack Query cache |
| Cart re-renders               | Zustand selectors — only the affected cart item re-renders, not the whole list |
| Barcode lookup                | Exact match on barcode — single DB index hit, no search overhead. Cached |
| Scan sound preload            | `Audio` object created once, `.preload = 'auto'`           |
| Intersection Observer         | Infinite scroll for product search results (no pagination buttons) |

### 19.4 Core Web Vitals Targets

| Metric | Target  | Strategy                                                |
| ------ | ------- | ------------------------------------------------------- |
| LCP    | < 1.5s  | Inline critical CSS, preload Inter font, lazy-load routes |
| FID    | < 100ms | No heavy JS on main thread during initial render         |
| CLS    | < 0.1   | Reserve space for loading skeletons, fixed layout zones   |

---

## 20. Accessibility Implementation

### 20.1 Keyboard Navigation (POS)

```tsx
// POS cart: Tab moves between items, Enter activates, Arrow keys adjust qty
function CartItem({ item, onRemove, onQtyChange }: Props) {
  return (
    <div role="listitem" tabIndex={0} className="focus:ring-2 focus:ring-primary-500 rounded">
      <span>{item.product.name}</span>
      <QtyStepperAccessible
        value={item.quantity}
        onChange={(qty) => onQtyChange(item.productId, qty)}
        aria-label={`Quantity for ${item.product.name}`}
      />
      <button onClick={() => onRemove(item.productId)} aria-label={`Remove ${item.product.name}`}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
```

### 20.2 Screen Reader Announcements

```tsx
// Live region for cart updates
function CartLiveRegion() {
  const itemCount = useCartStore(s => s.items.length);
  const netAmount = useCartStore(s => s.netAmount());

  return (
    <div role="status" aria-live="polite" className="sr-only">
      Cart has {itemCount} items. Total: {formatIndianCurrency(netAmount)}
    </div>
  );
}
```

### 20.3 Focus Management

- After adding an item to cart: focus stays on scan input (don't steal focus)
- After closing a modal: focus returns to the trigger button
- After navigation: focus moves to the page heading (via `useEffect` + `ref.focus()`)
- All modals trap focus inside (handled by Shadcn/ui Dialog component)

### 20.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 21. Development Workflow

### 21.1 Local Setup

```bash
# Prerequisites: Node 22+, backend running (docker compose up)
cd apps/web
npm install
npm run dev          # http://localhost:5173

# With API mocking (no backend needed)
npm run dev:mock     # Uses MSW to intercept all API calls

# Storybook (component dev)
npm run storybook    # http://localhost:6006
```

### 21.2 CI Pipeline

```
On Pull Request:
  ├── Lint (ESLint)
  ├── Type Check (tsc --noEmit)
  ├── Unit + Component Tests (Vitest)
  ├── Build check (vite build)
  └── Bundle size check (fail if > 500KB initial JS)

On Merge to main:
  ├── All of above
  ├── E2E Tests (Playwright on Chrome + Mobile Safari emulation)
  ├── Build production bundle
  └── Deploy to staging (Nginx container)
```

### 21.3 Code Review Checklist

Every frontend PR must confirm:
- [ ] Role-based visibility: sensitive data (cost price) hidden for salesperson
- [ ] Responsive: tested on 360px viewport (Chrome DevTools)
- [ ] Accessibility: all interactive elements have labels, focus management works
- [ ] Loading states: skeleton shown during data fetch, not a blank screen
- [ ] Error states: API errors display user-friendly toasts, not raw errors
- [ ] GST scheme: any bill/invoice related UI adapts for Regular vs Composition
- [ ] Offline: component degrades gracefully when `useOnline()` returns false (Phase 3+)
- [ ] No `console.log` left in production code

---

*End of Document*
