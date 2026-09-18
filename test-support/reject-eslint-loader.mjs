export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'eslint') {
        throw new Error('ESLint was loaded before the Node.js version guard');
    }

    return nextResolve(specifier, context);
}
