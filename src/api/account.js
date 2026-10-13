import { USE_AWS } from './backend';
import * as fb from './firebase/account';
import * as aws from './aws/account';

/**
 * Chooses the backend for this file's functions: AWS when the app was built with VITE_BACKEND=aws, Firebase otherwise.
 * See api/README.md. The two files behind it have the same functions, and the page code never knows which one it got.
 */
const impl = USE_AWS ? aws : fb;

export const exportMyData = (...args) => impl.exportMyData(...args);
export const reauthenticate = (...args) => impl.reauthenticate(...args);
export const deleteMyAccount = (...args) => impl.deleteMyAccount(...args);
export { downloadExport } from './firebase/account';
