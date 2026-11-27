// Erro de aplicação: status e código viram a resposta HTTP no errorHandler de http/.
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
