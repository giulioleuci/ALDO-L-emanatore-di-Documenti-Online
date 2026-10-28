import { z } from 'zod';
export declare class GasValidators {
    /** Validates "A1", "A1:B10", "Sheet1!A1:B10", "'Sheet Name'!A1:B" */
    static a1Notation(): z.ZodString;
    /** Validates 30-60 char alphanumeric Google Spreadsheet IDs */
    static spreadsheetId(): z.ZodString;
    /** Validates "#FFF" or "#FFFFFF" */
    static hexColor(): z.ZodString;
    /** Parses JSON string, optionally validates against inner schema */
    static jsonString<T extends z.ZodType>(innerSchema: T): z.ZodPipe<z.ZodTransform<unknown, string>, T>;
    static jsonString(innerSchema?: undefined): z.ZodPipe<z.ZodTransform<unknown, string>, z.ZodAny>;
}
