export interface Interface {
	[key: string]: ((...args: any[]) => Promise<any>) | Interface;
}
