export type VoiceTemplateJson =
  | string
  | number
  | boolean
  | null
  | VoiceTemplateJson[]
  | { [key: string]: VoiceTemplateJson };

export interface VoiceSsmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: (string | VoiceSsmlNode)[];
}

export interface VoiceRequestTemplate {
  version: 1;
  url: string;
  method: 'POST' | 'GET';
  auth:
    | { kind: 'none' }
    | { kind: 'bearer' }
    | { kind: 'header'; name: string; prefix: string }
    | { kind: 'query'; name: string };
  headers: Record<string, string>;
  body:
    | { kind: 'none' }
    | { kind: 'json'; value: VoiceTemplateJson }
    | { kind: 'ssml'; root: VoiceSsmlNode }
    | { kind: 'multipart'; fields: Record<string, string> };
  result:
    | { kind: 'audio' }
    | { kind: 'base64'; path: string }
    | { kind: 'hex'; path: string }
    | { kind: 'url'; path: string }
    | { kind: 'text'; path: string };
}

export type VoiceTemplateValidation =
  | { valid: true; template: VoiceRequestTemplate }
  | { valid: false; errors: { path: string; message: string }[] };
