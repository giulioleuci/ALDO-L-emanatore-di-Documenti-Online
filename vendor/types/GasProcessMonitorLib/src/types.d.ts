export interface MonitorLogger {
    debug(message: string): unknown;
    info(message: string): unknown;
    warn(message: string): unknown;
    error(message: string): unknown;
}
export interface MonitorCache {
    get(key: string): string | null;
    put(key: string, value: string, expirationSeconds?: number): unknown;
    remove(key: string): unknown;
}
export interface MonitorCacheService {
    getScriptCache(): MonitorCache;
}
export interface MonitorProperties {
    getProperty(key: string): string | null;
    setProperty(key: string, value: string): unknown;
    deleteProperty(key: string): unknown;
}
export interface MonitorStep {
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime: number | null;
    endTime: number | null;
}
export interface MonitorJobState {
    jobId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    percentage: number;
    message: string;
    startTime: number | null;
    endTime: number | null;
    error: string | null;
    steps: MonitorStep[];
}
export interface MonitorSidebar {
    setTitle(title: string): this;
    setContent(html: string): this;
    setWidth(width: number): this;
    show(): unknown;
}
export interface MonitorUiService {
    createSidebar(): MonitorSidebar;
}
export interface DashboardOptions {
    pollingInterval?: number;
    width?: number;
}
