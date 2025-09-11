export const debounce = <F extends (...args: any[]) => any>(
	func: F,
	waitFor: number
): ((...args: Parameters<F>) => void) => {
	let timeout: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<F>): void => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), waitFor);
	};
};