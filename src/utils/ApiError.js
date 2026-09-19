export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = "Not signed in") { return new ApiError(401, msg); }
  static forbidden(msg = "You do not have permission to do that") { return new ApiError(403, msg); }
  static notFound(msg = "Not found") { return new ApiError(404, msg); }
  static conflict(msg, details) { return new ApiError(409, msg, details); }
}
