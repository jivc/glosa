// Modelo de datos de un proyecto de Glosa.
// Las posiciones de las citas son índices de caracteres (UTF-16) sobre `Doc.text`.

export type ID = string;

export type DocKind = 'text' | 'docx' | 'pdf' | 'markdown' | 'html' | 'rtf' | 'odt';

export interface Doc {
  id: ID;
  name: string;
  kind: DocKind;
  /** Texto plano sobre el que se codifica. Inmutable tras la importación. */
  text: string;
  /** Inicio (índice) de cada página, sólo para PDF. */
  pageStarts?: number[];
  /** Rangos de títulos detectados en DOCX/Markdown, para mostrarlos con estilo. */
  headings?: { start: number; end: number; level: number }[];
  comment: string;
  groupIds: ID[];
  createdAt: string;
  importedFrom?: string;
}

export interface Group {
  id: ID;
  name: string;
  color: string;
  comment: string;
}

export interface Code {
  id: ID;
  name: string;
  color: string;
  description: string;
  /** Código padre, para organizar en carpetas/jerarquía (opcional). */
  parentId?: ID;
  groupIds: ID[];
  createdAt: string;
}

export interface Quotation {
  id: ID;
  docId: ID;
  start: number;
  end: number;
  codeIds: ID[];
  comment: string;
  createdAt: string;
}

export type EntityKind = 'code' | 'quotation' | 'memo' | 'document';

export interface EntityRef {
  kind: EntityKind;
  id: ID;
}

export interface Memo {
  id: ID;
  title: string;
  /** Texto con formato Markdown ligero. */
  content: string;
  type: 'analítico' | 'metodológico' | 'teórico' | 'reflexivo' | 'otro';
  links: EntityRef[];
  createdAt: string;
  modifiedAt: string;
}

export interface Relation {
  id: ID;
  name: string;
  /** Si es simétrica, la flecha no tiene dirección. */
  symmetric: boolean;
  color: string;
  dashed: boolean;
}

/** Vínculo semántico entre dos entidades (p. ej. código —es causa de→ código). */
export interface Link {
  id: ID;
  source: EntityRef;
  target: EntityRef;
  relationId: ID;
}

export interface NetworkNode {
  ref: EntityRef;
  x: number;
  y: number;
}

export interface Network {
  id: ID;
  name: string;
  description: string;
  nodes: NetworkNode[];
  createdAt: string;
}

export interface ProjectData {
  format: 'glosa';
  version: 1;
  id: ID;
  name: string;
  description: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  documents: Doc[];
  documentGroups: Group[];
  codes: Code[];
  codeGroups: Group[];
  quotations: Quotation[];
  memos: Memo[];
  relations: Relation[];
  links: Link[];
  networks: Network[];
}
