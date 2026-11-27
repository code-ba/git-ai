declare module 'npmlog' {
  interface NpmLog {
    level: string;
    heading: string;
    headingStyle: Record<string, unknown>;
    addLevel(name: string, level: number, style?: Record<string, unknown>, disp?: string): void;
    [key: string]: any;
  }
  const npmlog: NpmLog;
  export default npmlog;
}
