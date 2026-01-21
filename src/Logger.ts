export abstract class Logger {
    /**
     * Core logging method that outputs formatted log messages with timestamp and level
     */
    public static log(file: string, log_level: string, task: string, message: any) {
        console.log(`${new Date().toISOString()} - ${log_level} - ${file} - ${task} - ${message}`);
    }

    /**
     * Log error level: Statements that describe non-fatal errors in the application
     * Used for logging handled exceptions
     * @param file The source file name where the log originates
     * @param task Function name or specific operation being logged
     * @param message The error message to display
     */
    public static logError(file: string, task: string, message: any) {
        Logger.log(file, "ERROR", task, message);
    }

    /**
     * Log debug level: Fine-grained statements concerning program state
     * Typically used for debugging and troubleshooting
     * @param file The source file name where the log originates
     * @param task Function name or specific operation being logged
     * @param message The debug message to display
     */
    public static logDebug(file: string, task: string, message: any) {
        Logger.log(file, "DEBUG", task, message);
    }

    /**
     * Log warn level: Statements that describe potentially harmful events or states
     * @param file The source file name where the log originates
     * @param task Function name or specific operation being logged
     * @param message The warning message to display
     */
    public static logWarn(file: string, task: string, message: any) {
        Logger.log(file, "WARN", task, message);
    }

    /**
     * Log fatal level: Most severe error conditions, assumedly resulting in program termination
     * @param file The source file name where the log originates
     * @param task Function name or specific operation being logged
     * @param message The fatal error message to display
     */
    public static logFatal(file: string, task: string, message: any) {
        Logger.log(file, "FATAL", task, message);
    }

    /**
     * Log info level: Informational statements concerning program state
     * Represents program events or behavior tracking
     * @param file The source file name where the log originates
     * @param task Function name or specific operation being logged
     * @param message The informational message to display
     */
    public static logInfo(file: string, task: string, message: string) {
        Logger.log(file, "INFO", task, message);
    }
}
