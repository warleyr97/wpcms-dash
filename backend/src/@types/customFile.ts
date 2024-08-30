export interface File {
  path: string;
  mimetype: string;
  originalname: string;
  [key: string]: any; // Permite outras propriedades opcionais
}
