const FIELD = '[a-z][a-z0-9_]{0,47}';

export const PRIVATE_FIELD_ID = new RegExp(`^${FIELD}$`, 'u');
export const PRIVATE_REFERENCE = new RegExp(`^private:([0-9a-f-]{36}):(${FIELD})$`, 'u');
export const PRIVATE_REFERENCE_IN_TEXT = new RegExp(`private:[0-9a-f-]{36}:${FIELD}`, 'u');
export const SECRET_PLACEHOLDER = new RegExp(`\\{\\{(${FIELD})\\}\\}`, 'u');

export const privateReference = (grantId: string, field: string): string =>
  `private:${grantId}:${field}`;

export const privateReferenceField = (reference: string): string | undefined =>
  PRIVATE_REFERENCE.exec(reference)?.[2];

export const secretPlaceholders = (text: string): string[] => [
  ...new Set(
    [...text.matchAll(new RegExp(SECRET_PLACEHOLDER.source, 'gu'))].map((match) => match[1]!),
  ),
];

export const fillSecretPlaceholders = (text: string, value: (field: string) => string): string =>
  text.replace(new RegExp(SECRET_PLACEHOLDER.source, 'gu'), (_match, field: string) =>
    value(field),
  );
