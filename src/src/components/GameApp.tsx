import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Contract, ZeroAddress, ZeroHash } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { zeroAddress } from 'viem';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ABI, CONTRACT_ADDRESS, INITIAL_GOLD, STATUS_MESSAGES } from '../config/contracts';
import '../styles/GameApp.css';

type TileMap = Record<number, number>;

export function GameApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [joining, setJoining] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [selectedTile, setSelectedTile] = useState(0);
  const [selectedBuilding, setSelectedBuilding] = useState(1);
  const [actionNote, setActionNote] = useState('');
  const [balanceValue, setBalanceValue] = useState<bigint | null>(null);
  const [decryptingBalance, setDecryptingBalance] = useState(false);
  const [tileValues, setTileValues] = useState<TileMap>({});
  const [statusValue, setStatusValue] = useState<number | null>(null);

  const playerAddress = address ?? zeroAddress;
  const contractReady = CONTRACT_ADDRESS !== ZeroAddress;

  const joinedQuery = useReadContract({
    abi: CONTRACT_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'hasJoined',
    args: [playerAddress],
    query: { enabled: isConnected && contractReady },
  });

  const balanceQuery = useReadContract({
    abi: CONTRACT_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'getBalance',
    args: [playerAddress],
    query: { enabled: isConnected && Boolean(joinedQuery.data) && contractReady },
  });

  const boardQuery = useReadContract({
    abi: CONTRACT_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'getBoard',
    args: [playerAddress],
    query: { enabled: isConnected && Boolean(joinedQuery.data) && contractReady },
  });

  const statusQuery = useReadContract({
    abi: CONTRACT_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'getLastPlacementStatus',
    args: [playerAddress],
    query: { enabled: isConnected && Boolean(joinedQuery.data) && contractReady },
  });

  const tiles = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);

  useEffect(() => {
    if (!joinedQuery.data) {
      setBalanceValue(null);
      setTileValues({});
      setStatusValue(null);
    }
  }, [joinedQuery.data]);

  const handleJoin = async () => {
    if (!signerPromise || !isConnected) {
      setActionNote('Connect your wallet first.');
      return;
    }
    if (!contractReady) {
      setActionNote('Set the deployed contract address before joining.');
      return;
    }

    try {
      setJoining(true);
      setActionNote('Preparing to join the encrypted realm...');
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.joinGame();
      setActionNote('Waiting for confirmation...');
      await tx.wait();
      setActionNote('Joined successfully. Your gold is encrypted on-chain.');
      await Promise.all([joinedQuery.refetch(), balanceQuery.refetch(), boardQuery.refetch(), statusQuery.refetch()]);
    } catch (error) {
      console.error(error);
      setActionNote('Failed to join the game.');
    } finally {
      setJoining(false);
    }
  };

  const handlePlaceBuilding = async () => {
    if (!instance || !address || !signerPromise) {
      setActionNote('Connect wallet and wait for Zama to initialize.');
      return;
    }

    if (!joinedQuery.data) {
      setActionNote('Join the game before building.');
      return;
    }
    if (!contractReady) {
      setActionNote('Set the deployed contract address before building.');
      return;
    }

    try {
      setPlacing(true);
      setActionNote('Encrypting your building choice...');
      const encryptedInput = await instance
        .createEncryptedInput(CONTRACT_ADDRESS, address)
        .add8(BigInt(selectedBuilding))
        .encrypt();

      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.placeBuilding(
        selectedTile,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );

      setActionNote('Submitting transaction to the chain...');
      await tx.wait();
      setActionNote('Placement sent. Decrypt tiles to reveal what you built.');

      await Promise.all([boardQuery.refetch(), balanceQuery.refetch(), statusQuery.refetch()]);
    } catch (error) {
      console.error(error);
      setActionNote('Failed to place building.');
    } finally {
      setPlacing(false);
    }
  };

  const decryptCiphertext = async (ciphertext: string, type: 'u8' | 'u64') => {
    if (!instance || !address || !signerPromise) {
      throw new Error('Missing encryption context.');
    }
    if (!ciphertext || ciphertext === ZeroHash) {
      throw new Error('Nothing to decrypt yet.');
    }

    const keypair = instance.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '7';
    const contractAddresses = [CONTRACT_ADDRESS];
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signer = await signerPromise;

    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message,
    );

    const result = await instance.userDecrypt(
      [{ handle: ciphertext, contractAddress: CONTRACT_ADDRESS }],
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      signer.address,
      startTimeStamp,
      durationDays,
    );

    const value = result[ciphertext];
    return type === 'u64' ? BigInt(value) : Number(value);
  };

  const decryptBalance = async () => {
    if (!balanceQuery.data || !contractReady) return;
    try {
      setDecryptingBalance(true);
      const clear = await decryptCiphertext(balanceQuery.data as string, 'u64');
      setBalanceValue(typeof clear === 'bigint' ? clear : BigInt(clear));
    } catch (error) {
      console.error(error);
      setActionNote('Unable to decrypt balance.');
    } finally {
      setDecryptingBalance(false);
    }
  };

  const decryptStatus = async () => {
    if (!statusQuery.data || !contractReady) return;
    try {
      const clear = await decryptCiphertext(statusQuery.data as string, 'u8');
      setStatusValue(Number(clear));
    } catch (error) {
      console.error(error);
      setActionNote('Unable to decrypt last action.');
    }
  };

  const decryptTile = async (index: number, ciphertext?: string) => {
    if (!ciphertext || !contractReady) return;
    try {
      const clear = await decryptCiphertext(ciphertext, 'u8');
      setTileValues(prev => ({ ...prev, [index]: Number(clear) }));
    } catch (error) {
      console.error(error);
      setActionNote('Unable to decrypt that tile.');
    }
  };

  const joined = Boolean(joinedQuery.data);
  const board = (boardQuery.data as string[] | undefined) || [];
  const statusText = statusValue != null ? STATUS_MESSAGES[statusValue] ?? 'Unknown result' : 'Encrypted';

  return (
    <div className="game-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Zama FHE City</p>
          <h1>Build in secret. Pay with encrypted gold.</h1>
          <p className="lede">
            Choose a tile, encrypt your building type, and let the relayer handle the crypto. Your map stays private
            until you decide to decrypt it.
          </p>
          <div className="cta-row">
            <ConnectButton />
            <button
              className="primary"
              onClick={handleJoin}
              disabled={!isConnected || joining || zamaLoading || joined || !contractReady}
            >
              {joining ? 'Joining...' : joined ? 'Joined' : 'Join Game'}
            </button>
            <button
              className="ghost"
              onClick={() => {
                void decryptStatus();
                void decryptBalance();
              }}
              disabled={!joined || zamaLoading || !contractReady}
            >
              Decrypt Status
            </button>
          </div>
          {!contractReady && (
            <p className="warning">
              Set <code>CONTRACT_ADDRESS</code> in <code>src/config/contracts.ts</code> to your Sepolia deployment before
              interacting.
            </p>
          )}
          {zamaError && <p className="warning">{zamaError}</p>}
          {actionNote && <p className="note">{actionNote}</p>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Encrypted Gold</div>
          <div className="stat-value">
            {balanceValue != null ? `${balanceValue.toString()} ꞏg` : 'Hidden'}
          </div>
          <div className="stat-sub">Initial grant: {INITIAL_GOLD} gold</div>
          <button
            className="secondary"
            onClick={decryptBalance}
            disabled={!balanceQuery.data || decryptingBalance || zamaLoading}
          >
            {decryptingBalance ? 'Decrypting...' : 'Decrypt Gold'}
          </button>
        </div>
      </header>

      <section className="panels">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Encrypted build</p>
              <h3>Select your move</h3>
            </div>
            <span className="chip">Grid 3x3</span>
          </div>

          <div className="form-grid">
            <div>
              <label className="label">Building type</label>
              <div className="options">
                {[1, 2, 3, 4].map(id => (
                  <button
                    key={id}
                    className={`option ${selectedBuilding === id ? 'active' : ''}`}
                    onClick={() => setSelectedBuilding(id)}
                  >
                    <span>Type {id}</span>
                    <small>{[100, 200, 400, 1000][id - 1]} gold</small>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Tile</label>
              <div className="tile-selector">
                {tiles.map(tile => (
                  <button
                    key={tile}
                    className={`tile-chip ${selectedTile === tile ? 'picked' : ''}`}
                    onClick={() => setSelectedTile(tile)}
                  >
                    #{tile + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="panel-actions">
            <button
              className="primary"
              onClick={handlePlaceBuilding}
              disabled={!joined || placing || zamaLoading || !contractReady}
            >
              {placing ? 'Sending...' : 'Encrypt & Build'}
            </button>
            <div className="status-chip">
              <span className="dot" />
              {statusText}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Secret map</p>
              <h3>Decrypt tiles on demand</h3>
            </div>
            <span className="chip muted">Click a tile to reveal</span>
          </div>
          <div className="grid">
            {tiles.map(index => {
              const cipher = board[index];
              const clearValue = tileValues[index];
              return (
                <div key={index} className="grid-cell">
                  <div className="cell-top">
                    <span className="label">Tile {index + 1}</span>
                    <span className="cipher">{cipher ? `${cipher.slice(0, 8)}...` : 'N/A'}</span>
                  </div>
                  <div className="cell-body">
                    <p className="value">
                      {clearValue != null ? `Building ${clearValue}` : 'Encrypted'}
                    </p>
                    <button
                      className="secondary"
                      onClick={() => void decryptTile(index, cipher)}
                      disabled={!cipher || zamaLoading}
                    >
                      Decrypt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
