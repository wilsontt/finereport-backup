export function success(res, data, status = 200) {
    res.status(status).json({ error: false, data });
}
export function error(res, code, message, status = 500) {
    res.status(status).json({
        error: true,
        code,
        message,
    });
}
//# sourceMappingURL=response.js.map