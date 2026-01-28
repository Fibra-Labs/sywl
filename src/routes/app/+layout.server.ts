import type {LayoutServerLoad} from './$types';

export const prerender = false;

export const load: LayoutServerLoad = async ({parent}) => {
    const {user} = await parent();
    return {user};
};
