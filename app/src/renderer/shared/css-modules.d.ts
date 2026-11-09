declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  // eslint-disable-next-line no-restricted-syntax -- CSS modules are default exports by design
  export default classes;
}
declare module '*.css';
