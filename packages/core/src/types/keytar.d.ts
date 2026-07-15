declare module "keytar" {
  const keytar: {
    getPassword(service: string, account: string): Promise<string | null>;
    setPassword(service: string, account: string, password: string): Promise<void>;
  };

  export default keytar;
}
