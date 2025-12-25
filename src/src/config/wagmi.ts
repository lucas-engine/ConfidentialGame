import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Confidential City Builder',
  projectId: '9d5213bb4b6a4a8d9b98cfe0c0f18b91',
  chains: [sepolia],
  ssr: false,
});
