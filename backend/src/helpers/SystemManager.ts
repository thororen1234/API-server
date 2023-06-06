import os from 'os';
import si from 'systeminformation';
import util from 'node:util';
import { exec } from 'node:child_process';
import SystemHistory from '../database/systemHistory';
const cmd = util.promisify(exec);

export default class SystemManager extends SystemHistory {
	used_bytes: number;
	bandwidth: number;
	constructor() {
		super();
		this.used_bytes = 0,
		this.bandwidth = 0;

		this.init();
	}

	async calculateNetworkUsage() {
		// Set initial used network bytes count
		if (this.used_bytes <= 0) this.used_bytes = (await si.networkStats()).reduce((prev, current) => prev + current.rx_bytes, 0);

		// Calculate used bandwidth
		const used_bytes_latest = (await si.networkStats()).reduce((prev, current) => prev + current.rx_bytes, 0);
		this.bandwidth += used_bytes_latest - this.used_bytes;
		this.used_bytes = used_bytes_latest;
		return this.bandwidth;
	}

	calculateMemoryUsage() {
		return {
			USAGE: Number(process.memoryUsage().heapUsed.toFixed(2)),
			MAX: Number(os.totalmem().toFixed(2)),
		};
	}

	async calculateCPUUsage() {
		return Math.round(await si.currentLoad().then(l => l.currentLoad));
	}

	async calculateDiskUsage() {
		const platform = process.platform;

		if (platform == 'win32') {
			const { stdout } = await cmd('wmic logicaldisk get size,freespace,caption');
			const parsed = stdout.trim().split('\n').slice(1).map(line => line.trim().split(/\s+(?=[\d/])/));
			const filtered = parsed.filter(d => process.cwd().toUpperCase().startsWith(d[0].toUpperCase()));
			return {
				free: Number(filtered[0][1]),
				total: Number(filtered[0][2]),
			};
		} else if (platform == 'linux') {
			const { stdout } = await cmd('df -Pk --');
			const parsed = stdout.trim().split('\n').slice(1).map(line => line.trim().split(/\s+(?=[\d/])/));
			const filtered = parsed.filter(() => true);
			// Multiply by 1024 cuz linux
			return {
				free: Number(filtered[0][3]) * 1024,
				total: Number(filtered[0][1]) * 1024,
			};
		}
	}

	async saveSystemHistory() {
		const mem = this.calculateMemoryUsage();
		const cpu = await this.calculateCPUUsage();

		await this.create({ memoryUsage: `${mem.USAGE}`, cpuUsage: cpu });
	}

	init() {
		setInterval(async () => await this.saveSystemHistory(), 60_000);
	}
}
