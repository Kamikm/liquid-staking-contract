import { Address, Cell, toNano } from 'ton-core';
import { Pool } from '../wrappers/Pool';
import { DAOJettonMinter, jettonContentToCell } from '../wrappers/DAOJettonMinter';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {

    const sender   = provider.sender();
    const admin:Address = sender.address!;

    const pool_code = await compile('Pool');
    const controller_code = await compile('Controller');
    const awaited_minter_code = await compile('AwaitedJettonMinter');
    const awaited_wallet_code = await compile('AwaitedJettonWallet');

    const dao_minter_code = await compile('DAOJettonMinter');
    const dao_wallet_code = await compile('DAOJettonWallet');
    const dao_vote_keeper_code = await compile('DAOVoteKeeper');
    const dao_voting_code = await compile('DAOVoting');

    const content = jettonContentToCell({type:1,uri:"https://example.com/2.json"});

    const minter  = DAOJettonMinter.createFromConfig({
                                                  admin,
                                                  content,
                                                  wallet_code:dao_wallet_code,
                                                  voting_code:dao_voting_code,
                                                  vote_keeper_code:dao_vote_keeper_code},
                                                  dao_minter_code);
    let poolConfig = {
          pool_jetton : minter.address,
          pool_jetton_supply : 0n,

          sudoer : admin,
          governor : admin,
          interest_manager : admin,
          halter : admin,
          consigliere : admin,
          approver : admin,

          controller_code : controller_code,
          awaited_jetton_wallet_code : awaited_wallet_code,
          pool_jetton_wallet_code : dao_wallet_code,
          payout_minter_code : awaited_minter_code,
          vote_keeper_code : dao_vote_keeper_code,
    };

    const pool = provider.open(Pool.createFromConfig(poolConfig, pool_code));

    // Deployment scheme:
    // 1. Deploy DAO Minter with wallet as admin
    // 2. Deploy Pool with DAO Minter as main jetton minter (all other roles set to wallet)
    // 3. Transfer adminship of DAO Minter to Pool
    const poolJetton = provider.open(minter);

    //await provider.deploy(minter, toNano('0.05'));
    //await provider.deploy(pool, toNano('0.1'));
    //await poolJetton.sendChangeAdmin(provider.sender(), pool.address);
    await pool.sendDeposit(provider.sender(), toNano("1.2"));
    /*const pool = provider.open(Pool.createFromConfig({}, pool_code));

    await pool.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(pool.address);
    */
    // run methods on `pool`
}
