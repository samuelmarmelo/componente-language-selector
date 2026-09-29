/*
 * Host-owned Google Translate bootstrap.
 *
 * This file is intentionally external: production CSP does not allow inline
 * scripts. It is loaded in the head so the callback exists before the Google
 * loader, which the language switcher injects asynchronously on demand.
 *
 * The Google loader can invoke this callback before the site's
 * module script has mounted the SafeWidget. Do not construct TranslateElement
 * here: doing so leaves an empty combo marked as pending, and the application
 * cannot recover after its module starts. The widget runtime installs the
 * actual initializer when it is ready and reuses this callback safely.
 */
window.googleTranslateElementInit2 = function googleTranslateElementInit2() {
  // Deliberately empty. The application-owned SafeWidget initializes Google
  // after its module is mounted and the host target is available.
};
