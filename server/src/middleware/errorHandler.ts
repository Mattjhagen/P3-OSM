import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    // In production do not log raw error message (may contain tokens/PII)
    if (process.env.NODE_ENV === 'production') {
        console.error(`[Error] status=${status} code=${err.code || 'none'}`);
    } else {
        console.error(`[Error]: ${message}`, err.stack || '');
    }

    res.status(status).json({
        success: false,
        error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message,
        code: err.code || undefined,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};
