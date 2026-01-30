/**
 * Merkle Tree Implementation
 * 
 * Provides tree construction, root calculation, and proof generation
 * for anchoring multiple proofHashes to a single root.
 */

import * as Crypto from 'expo-crypto';
import { MerkleProofNode } from './anchorTypes';

/**
 * Node in Merkle tree (internal representation)
 */
interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  isLeaf: boolean;
  index?: number;  // For leaf nodes: position in original array
}

/**
 * Build a Merkle tree from a list of hashes
 * 
 * @param hashes - Array of hash strings (leaf values)
 * @returns Root node of the tree
 */
export async function buildMerkleTree(hashes: string[]): Promise<MerkleNode> {
  if (hashes.length === 0) {
    throw new Error('Cannot build Merkle tree from empty hash array');
  }

  if (hashes.length === 1) {
    return {
      hash: hashes[0],
      isLeaf: true,
      index: 0,
    };
  }

  // Create leaf nodes
  let nodes: MerkleNode[] = hashes.map((hash, index) => ({
    hash,
    isLeaf: true,
    index,
  }));

  // Build tree bottom-up
  while (nodes.length > 1) {
    const nextLevel: MerkleNode[] = [];

    // Process pairs
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = i + 1 < nodes.length ? nodes[i + 1] : left; // Duplicate last if odd

      // Parent hash = H(left || right)
      const parentHash = await hashPair(left.hash, right.hash);

      nextLevel.push({
        hash: parentHash,
        left,
        right,
        isLeaf: false,
      });
    }

    nodes = nextLevel;
  }

  return nodes[0];
}

/**
 * Get the root hash of a tree
 */
export function getMerkleRoot(root: MerkleNode): string {
  return root.hash;
}

/**
 * Generate Merkle proof for a specific leaf hash
 * Returns the path from leaf to root
 * 
 * @param root - Root node of tree
 * @param targetHash - The leaf hash to prove
 * @returns Array of sibling hashes with their positions
 */
export function generateMerkleProof(
  root: MerkleNode,
  targetHash: string
): MerkleProofNode[] {
  const proof: MerkleProofNode[] = [];
  let found = false;

  function traverse(node: MerkleNode | undefined): boolean {
    if (!node) return false;

    if (node.isLeaf && node.hash === targetHash) {
      found = true;
      return true;
    }

    if (!node.isLeaf) {
      // Check left subtree
      if (node.left && traverse(node.left)) {
        // Add right sibling to proof
        if (node.right) {
          proof.push({
            hash: node.right.hash,
            position: 'right',
          });
        }
        return true;
      }

      // Check right subtree
      if (node.right && traverse(node.right)) {
        // Add left sibling to proof
        if (node.left) {
          proof.push({
            hash: node.left.hash,
            position: 'left',
          });
        }
        return true;
      }
    }

    return false;
  }

  traverse(root);

  if (!found) {
    throw new Error(`Hash not found in tree: ${targetHash}`);
  }

  return proof;
}

/**
 * Verify a Merkle proof
 * 
 * @param leafHash - The original leaf hash
 * @param proof - Array of sibling hashes
 * @param root - Expected root hash
 * @returns true if proof is valid
 */
export async function verifyMerkleProof(
  leafHash: string,
  proof: MerkleProofNode[],
  root: string
): Promise<boolean> {
  let hash = leafHash;

  // Reconstruct root by hashing with siblings
  for (const node of proof) {
    if (node.position === 'left') {
      hash = await hashPair(node.hash, hash);
    } else {
      hash = await hashPair(hash, node.hash);
    }
  }

  return hash === root;
}

/**
 * Helper: hash two values together
 * H(left || right)
 */
async function hashPair(left: string, right: string): Promise<string> {
  const combined = left + right;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
  return hash;
}

/**
 * Calculate tree depth (height)
 */
export function getTreeDepth(root: MerkleNode): number {
  if (root.isLeaf) return 0;
  
  let maxDepth = 0;
  
  function traverse(node: MerkleNode | undefined, depth: number): void {
    if (!node) return;
    maxDepth = Math.max(maxDepth, depth);
    if (!node.isLeaf) {
      traverse(node.left, depth + 1);
      traverse(node.right, depth + 1);
    }
  }
  
  traverse(root, 0);
  return maxDepth;
}

/**
 * Get all leaf hashes in order
 */
export function getLeafHashes(root: MerkleNode): string[] {
  const leaves: string[] = [];
  
  function traverse(node: MerkleNode | undefined): void {
    if (!node) return;
    if (node.isLeaf) {
      leaves.push(node.hash);
    } else {
      traverse(node.left);
      traverse(node.right);
    }
  }
  
  traverse(root);
  return leaves;
}

/**
 * Create a Merkle batch from multiple proof hashes
 * Returns the root and is ready for blockchain anchoring
 */
export async function createMerkleBatch(proofHashes: string[]): Promise<{
  rootHash: string;
  treeDepth: number;
  leafCount: number;
  tree: MerkleNode;
}> {
  if (proofHashes.length === 0) {
    throw new Error('Cannot create batch from empty array');
  }

  const tree = await buildMerkleTree(proofHashes);
  const rootHash = getMerkleRoot(tree);
  const treeDepth = getTreeDepth(tree);
  const leafCount = proofHashes.length;

  return {
    rootHash,
    treeDepth,
    leafCount,
    tree,
  };
}
