import { describe, expect, it } from 'vitest';
import { validateProjectName } from '../src/utils/validators.js';

describe('validateProjectName', () => {
  it('accepts a simple kebab-case name', () => {
    const result = validateProjectName('my-api');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.packageName).toBe('my-api');
      expect(result.directoryName).toBe('my-api');
    }
  });

  it('trims surrounding whitespace', () => {
    const result = validateProjectName('  my-api  ');
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.packageName).toBe('my-api');
  });

  it('accepts a scoped name and derives the directory from it', () => {
    const result = validateProjectName('@acme/my-api');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.packageName).toBe('@acme/my-api');
      expect(result.directoryName).toBe('my-api');
    }
  });

  it.each([
    ['', 'Project name is required.'],
    ['   ', 'Project name is required.'],
    ['.', 'Project name cannot be "." or "..".'],
    ['..', 'Project name cannot be "." or "..".'],
  ])('rejects %j', (input, expectedError) => {
    const result = validateProjectName(input);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain(expectedError);
  });

  it('rejects names with spaces and explains the allowed characters', () => {
    const result = validateProjectName('my api');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Use only lowercase letters, numbers and the characters - _ . ~');
    }
  });

  it('rejects unscoped names containing a slash and suggests scoping instead', () => {
    const result = validateProjectName('acme/my-api');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain(
        'Project name cannot contain "/". Use a scoped name like "@acme/my-api" instead.',
      );
    }
  });

  it('rejects backslashes so a Windows path cannot be smuggled in', () => {
    const result = validateProjectName('..\\..\\evil');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain('Project name cannot contain backslashes.');
  });

  it('rejects names starting with a period or an underscore', () => {
    expect(validateProjectName('.hidden').valid).toBe(false);
    expect(validateProjectName('_private').valid).toBe(false);
  });

  it('rejects the reserved node_modules name', () => {
    const result = validateProjectName('node_modules');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('"node_modules" is reserved and cannot be used');
    }
  });

  it.each(['con', 'PRN', 'nul', 'com1', 'LPT9'])('rejects the Windows device name %s', (name) => {
    const result = validateProjectName(name);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toContain(`"${name}" is a reserved device name on Windows.`);
  });

  it('rejects names ending in a space or period, which Windows silently strips', () => {
    expect(validateProjectName('my-api.').valid).toBe(false);
    expect(validateProjectName('my-api ').valid).toBe(true);
  });

  it('warns about capital letters without rejecting the name', () => {
    const result = validateProjectName('MyApi');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings).toContain(
        'Capital letters are allowed but the name is usually kept lowercase',
      );
      expect(result.warnings).toContain(
        'This name cannot be published to npm as a new package. Keep it lowercase if you plan to publish.',
      );
    }
  });

  it('never reports the same problem twice', () => {
    const result = validateProjectName('My Api');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(new Set(result.errors).size).toBe(result.errors.length);
    }
  });
});
