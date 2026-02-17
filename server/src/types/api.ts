/**
 * Standard API Response envelope
 */
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    stack?: string;
}
