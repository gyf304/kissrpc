export interface Requester {
	request(path: string[], args: unknown[]): Promise<unknown>;
}
