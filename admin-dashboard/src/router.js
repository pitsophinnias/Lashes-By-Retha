// A tiny history.pushState/popstate router for the owner/staff dashboard's
// existing activePage state - not react-router. Everything here already
// renders from one component via `activePage === 'x' && (...)` blocks
// rather than <Route> elements, so swapping in react-router would mean
// restructuring that whole render tree; this gets the same real URLs
// (not a #/ hash router), working back/forward and refresh-stays-put,
// for a fraction of the churn.
export const PAGE_TO_PATH = {
  dashboard: '/',
  products: '/products',
  orders: '/orders',
  preorders: '/preorders',
  training: '/lash-training',
  images: '/image-management',
  content: '/website-content',
  notifications: '/notifications',
  settings: '/settings',
}

export const PATH_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page])
)

export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  products: 'Products',
  orders: 'Orders',
  preorders: 'Pre-orders',
  training: 'Lash Training',
  images: 'Image Management',
  content: 'Website Content',
  notifications: 'Notifications',
  settings: 'Settings',
}

// Staff can't see several owner-only pages at all (see the sidebar's own
// role filter) - a staff session landing on one of those via a typed or
// bookmarked URL falls back to Dashboard, the same as a totally unknown path.
const STAFF_ONLY_PAGES = new Set(['products', 'images', 'training', 'content', 'preorders'])
export const isPageVisibleToRole = (page, role) => !(role === 'staff' && STAFF_ONLY_PAGES.has(page))

export const pageForPath = (pathname, role) => {
  const page = PATH_TO_PAGE[pathname]
  if (!page || !isPageVisibleToRole(page, role)) return 'dashboard'
  return page
}

export const pathForPage = (page) => PAGE_TO_PATH[page] || '/'

export const isOwnerStaffPath = (path) => typeof path === 'string' && Object.prototype.hasOwnProperty.call(PATH_TO_PAGE, path)

// The sysadmin dashboard is a separate component with its own page set,
// under its own /sysadmin prefix so nothing clashes with the owner/staff
// paths above (both have a Settings page). A completely separate map
// rather than folding these into PAGE_TO_PATH - the two dashboards already
// use the same page-value strings for different things (both have a
// 'settings'), so a single shared map would just overwrite one with the
// other.
export const SYSADMIN_PAGE_TO_PATH = {
  overview: '/sysadmin',
  users: '/sysadmin/users',
  roles: '/sysadmin/roles',
  audit: '/sysadmin/audit-log',
  controls: '/sysadmin/system-controls',
  payments: '/sysadmin/payments',
  health: '/sysadmin/system-health',
  errors: '/sysadmin/errors',
  testData: '/sysadmin/test-data',
  backups: '/sysadmin/backups',
  loginActivity: '/sysadmin/login-activity',
  settings: '/sysadmin/settings',
}

export const SYSADMIN_PATH_TO_PAGE = Object.fromEntries(
  Object.entries(SYSADMIN_PAGE_TO_PATH).map(([page, path]) => [path, page])
)

export const SYSADMIN_PAGE_TITLES = {
  overview: 'Overview',
  users: 'Users',
  roles: 'Roles',
  audit: 'Audit Log',
  controls: 'System Controls',
  payments: 'Payments',
  health: 'System Health',
  errors: 'Errors',
  testData: 'Test Data',
  backups: 'Backups',
  loginActivity: 'Login Activity',
  settings: 'Settings',
}

export const isSysadminPath = (path) => typeof path === 'string' && Object.prototype.hasOwnProperty.call(SYSADMIN_PATH_TO_PAGE, path)

export const pageForSysadminPath = (pathname) => SYSADMIN_PATH_TO_PAGE[pathname] || 'overview'
export const pathForSysadminPage = (page) => SYSADMIN_PAGE_TO_PATH[page] || '/sysadmin'

// Used to validate a `next` query param before redirecting there after
// login - only ever a known admin page path (either namespace), never an
// arbitrary string, so a crafted link can't send anyone off to some other
// origin. Role-specific validation (which namespace a given role is
// actually allowed into) is resolveNextForRole, below.
export const isKnownAdminPath = (path) => isOwnerStaffPath(path) || isSysadminPath(path)

export const homeForRole = (role) => (role === 'sysadmin' ? '/sysadmin' : '/')

// A sysadmin can only ever land in the /sysadmin/* namespace, and owner/
// staff only in the other - a next= pointing at the wrong namespace (or
// nothing at all) falls back to that role's own home instead.
export const resolveNextForRole = (next, role) => {
  const home = homeForRole(role)
  if (!next) return home
  return role === 'sysadmin'
    ? (isSysadminPath(next) ? next : home)
    : (isOwnerStaffPath(next) ? next : home)
}
