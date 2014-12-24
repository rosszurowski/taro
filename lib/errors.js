/**
 * Custom HTTP errors, for API responses in synchronous functions
 *
 */

// 400-series
construct('BadRequestError', 400, 'BAD_REQUEST', 'Bad Request');
construct('NotAuthorizedError', 401, 'NOT_AUTHORIZED', 'Not Authorized');
construct('PaymentRequiredError', 402, 'PAYMENT_REQUIRED', 'Payment Required');
construct('ForbiddenError', 403, 'FORBIDDEN', 'Forbidden');
construct('NotFoundError', 404, 'NOT_FOUND', 'Not Found');
construct('MethodNotAllowedError', 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
construct('NotAcceptableError', 406, 'NOT_ACCEPTABLE', 'Not Acceptable');

/**
 * Construct an Error prototype
 * @param {String} api
 * @param {Number} status
 * @param {String} code
 * @param {String} message
 * @returns {void}
 */
function construct(api, status, code, message) {
	var constructor = exports[api] = function(m) {
		this.status  = status;
		this.code    = code;
		this.message = m || message;
	}
	constructor.prototype = new Error();
	constructor.prototype.constructor = constructor;
}