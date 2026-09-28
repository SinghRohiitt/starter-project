import validateNpmPackageName from 'validate-npm-package-name';

/** Windows refuses these as directory names regardless of extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type NameValidation =
  | { valid: true; packageName: string; directoryName: string; warnings: string[] }
  | { valid: false; errors: string[]; warnings: string[] };

/**
 * Validates the name the user typed into a form that is safe to use both as an
 * npm package name and as a directory name.
 *
 * Scoped names (`@acme/my-api`) are accepted: the package keeps the scope while
 * the directory is created as `my-api`.
 */
export function validateProjectName(rawName: string): NameValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  const name = rawName.trim();
  if (name.length === 0) {
    return { valid: false, errors: ['Project name is required.'], warnings };
  }

  if (name === '.' || name === '..') {
    return { valid: false, errors: ['Project name cannot be "." or "..".'], warnings };
  }

  if (/[\\]/.test(name)) {
    errors.push('Project name cannot contain backslashes.');
  }

  if (name.includes('/') && !name.startsWith('@')) {
    errors.push('Project name cannot contain "/". Use a scoped name like "@acme/my-api" instead.');
  }

  const result = validateNpmPackageName(name);
  errors.push(...(result.errors ?? []).map(humanizeNpmError));
  warnings.push(...(result.warnings ?? []).map(humanizeNpmWarning));

  // `validForNewPackages: false` with no error text means the name is only valid
  // for packages published before a rule changed (currently: capital letters).
  // That is a registry restriction rather than a filesystem hazard, so the name
  // is accepted with a warning instead of being blocked.
  if (!result.validForNewPackages && errors.length === 0) {
    warnings.push('This name cannot be published to npm as a new package. Keep it lowercase if you plan to publish.');
  }

  const directoryName = name.startsWith('@') ? (name.split('/')[1] ?? '') : name;
  if (WINDOWS_RESERVED.test(directoryName)) {
    errors.push(`"${directoryName}" is a reserved device name on Windows.`);
  }
  if (/[ .]$/.test(directoryName)) {
    errors.push('Project name cannot end with a space or a period.');
  }

  if (errors.length > 0) {
    return { valid: false, errors: dedupe(errors), warnings: dedupe(warnings) };
  }

  return { valid: true, packageName: name, directoryName, warnings: dedupe(warnings) };
}

/**
 * `validate-npm-package-name` returns terse rule strings that are meaningless to
 * most users, so map the ones we can to plain language. Every message is
 * capitalised because it is printed as a standalone bullet in the error list.
 */
function humanizeNpmError(problem: string): string {
  const map: Record<string, string> = {
    'name can only contain URL-friendly characters':
      'use only lowercase letters, numbers and the characters - _ . ~',
    'name cannot start with a period': 'cannot start with "."',
    'name cannot start with an underscore': 'cannot start with "_"',
    'node_modules is not a valid package name': '"node_modules" is reserved and cannot be used',
  };
  return capitalise(map[problem] ?? problem);
}

function humanizeNpmWarning(problem: string): string {
  const map: Record<string, string> = {
    'name can no longer contain capital letters':
      'capital letters are allowed but the name is usually kept lowercase',
    'name can no longer contain more than 214 characters':
      'names longer than 214 characters will be rejected when publishing',
  };
  return capitalise(map[problem] ?? problem);
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
