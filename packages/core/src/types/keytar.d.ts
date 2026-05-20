declare module "keytar" {
  function getPassword(service: string, account: string): Promise<string | null>;
  function setPassword(service: string, account: string, password: string): Promise<void>;

  const keytar: {
    getPassword: typeof getPassword;
    setPassword: typeof setPassword;
  };

  export default keytar;
}
