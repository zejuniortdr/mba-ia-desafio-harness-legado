// Arquivo recebido no upload, sem depender de Express ou multer.
export type UploadedFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}
