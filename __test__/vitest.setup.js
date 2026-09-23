// Clear rendered components after each test so UI state cannot leak between tests.
import { afterEach } from 'vitest';

afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
