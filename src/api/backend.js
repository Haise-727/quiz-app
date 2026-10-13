/**
 * Which backend the app talks to, decided when it is built: VITE_BACKEND=aws for AWS (Cognito, Lambda, DynamoDB),
 * anything else for Firebase. The live game stays on the Firebase Realtime Database on both.
 */
export const USE_AWS = import.meta.env.VITE_BACKEND === 'aws';
