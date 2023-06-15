import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Address, Cell, toNano, Dictionary, beginCell } from 'ton-core';
import { Pool } from '../wrappers/Pool';
import { Controller } from '../wrappers/Controller';
import { JettonMinter as DAOJettonMinter, jettonContentToCell } from '../contracts/jetton_dao/wrappers/JettonMinter';
import { JettonWallet as PoolJettonWallet } from '../wrappers/JettonWallet';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

const loadConfig = (config:Cell) => {
          return config.beginParse().loadDictDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell());
        };

describe('Pool', () => {
    let pool_code: Cell;
    let controller_code: Cell;
    let payout_collection: Cell;

    let dao_minter_code: Cell;
    let dao_wallet_code: Cell;
    let dao_vote_keeper_code: Cell;
    let dao_voting_code: Cell;

    let blockchain: Blockchain;
    let pool: SandboxContract<Pool>;
    let controller: SandboxContract<Controller>;
    let poolJetton: SandboxContract<DAOJettonMinter>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer', {balance: toNano("1000000000")});



        payout_collection = await compile('PayoutNFTCollection');

        pool_code = await compile('Pool');
        controller_code = await compile('Controller');

        dao_minter_code = await compile('DAOJettonMinter');
        dao_wallet_code = await compile('DAOJettonWallet');
        dao_vote_keeper_code = await compile('DAOVoteKeeper');
        dao_voting_code = await compile('DAOVoting');



        const content = jettonContentToCell({type:1,uri:"https://example.com/1.json"});
        poolJetton  = blockchain.openContract(DAOJettonMinter.createFromConfig({
                                                  admin:deployer.address,
                                                  content,
                                                  voting_code:dao_voting_code},
                                                  dao_minter_code));
        let poolConfig = {
              pool_jetton : poolJetton.address,
              pool_jetton_supply : 0n,
              optimistic_deposit_withdrawals: 0n,

              sudoer : deployer.address,
              governor : deployer.address,
              interest_manager : deployer.address,
              halter : deployer.address,
              consigliere : deployer.address,
              approver : deployer.address,

              controller_code : controller_code,
              pool_jetton_wallet_code : dao_wallet_code,
              payout_minter_code : payout_collection,
              vote_keeper_code : dao_vote_keeper_code,
        };

        pool = blockchain.openContract(Pool.createFromConfig(poolConfig, pool_code));
        let controllerConfig = {
          controllerId:0,
          validator: deployer.address,
          pool: pool.address,
          governor: deployer.address,
          approver: deployer.address,
          halter: deployer.address,
        };
        controller = blockchain.openContract(Controller.createFromConfig(controllerConfig, controller_code));

    });

    beforeEach(async () => {
    });

    it('should deploy', async () => {

        //await blockchain.setVerbosityForAddress(pool.address, {blockchainLogs:true, vmLogs: 'vm_logs'});
        const poolDeployResult = await pool.sendDeploy(deployer.getSender(), toNano('11'));
        expect(poolDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pool.address,
            deploy: true,
            success: true,
        });
        const poolJettonDeployResult = await poolJetton.sendDeploy(deployer.getSender(), toNano('1.05'));
        expect(poolJettonDeployResult.transactions).toHaveTransaction({
                         from: deployer.address,
                         to: poolJetton.address,
                         deploy: true,
                         success: true,
        });
        const adminTransferResult = await poolJetton.sendChangeAdmin(deployer.getSender(), pool.address);
        expect(adminTransferResult.transactions).toHaveTransaction({
                         on: poolJetton.address,
                         success: true,
        });
        const controllerDeployResult = await pool.sendRequestControllerDeploy(deployer.getSender(), toNano('100000'), 0);
        expect(controllerDeployResult.transactions).toHaveTransaction({
                         from: pool.address,
                         to: controller.address,
                         deploy: true,
                         success: true,
        });
        const approveResult = await controller.sendApprove(deployer.getSender());
        expect(approveResult.transactions).toHaveTransaction({
                         from: deployer.address,
                         to: controller.address,
                         success: true,
        });
    });

    it('should deposit', async () => {
        const depositResult = await pool.sendDeposit(deployer.getSender(), toNano('10'));
        let depositPayout = blockchain.openContract(await pool.getDepositMinter());
        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: pool.address,
            success: true,
        });
        expect(depositResult.transactions).toHaveTransaction({
            on: deployer.address,
            op: 0x05138d91, // ownership assigned
            success: true,
        });


        const deposit2Result = await pool.sendDeposit(deployer.getSender(), toNano('10'));
        expect(deposit2Result.transactions).not.toHaveTransaction({
            on: depositPayout.address,
            op: 0xf5aa8943, // init
        });
        expect(deposit2Result.transactions).toHaveTransaction({
            on: deployer.address,
            op: 0x05138d91, // transfer notification
            success: true,
        });
    });


    it('should rotate round', async () => {

        let prevDepositPayout = blockchain.openContract(await pool.getDepositMinter());
        //await blockchain.setVerbosityForAddress(prevAwaitedJettonMinter.address, {blockchainLogs:true, vmLogs: 'vm_logs'});

        const confDict = loadConfig(blockchain.config);
        confDict.set(34, beginCell().storeUint(0x12, 8).storeUint(0, 32).storeUint(0xffffffff, 32).endCell());
        blockchain.setConfig(beginCell().storeDictDirect(confDict).endCell());

        await blockchain.setVerbosityForAddress(Address.parse("EQBXKrDEBs9LSOXeGd_mE22sWOA01eXytgnBVpiSieVYQBR3"), {blockchainLogs:true, vmLogs: 'vm_logs'});

        const depositResult = await pool.sendDeposit(deployer.getSender(), toNano('3.05'));

        let depositPayout = blockchain.openContract(await pool.getDepositMinter());
        expect(depositResult.transactions).toHaveTransaction({
            on: depositPayout.address,
            success: true,
        });
        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: pool.address,
            success: true,
        });

        expect(depositResult.transactions).toHaveTransaction({
            on: poolJetton.address,
            success: true,
            op:0x1674b0a0 //mint
        });
        let payoutJettonWalletAddress = await poolJetton.getWalletAddress(prevDepositPayout.address);

        expect(depositResult.transactions).toHaveTransaction({
            on: prevDepositPayout.address,
            from: payoutJettonWalletAddress,
            success: true,
        });
        expect(depositResult.transactions).toHaveTransaction({
            on: deployer.address,
            op: 0x7362d09c, // transfer_notification
            success: true,
        });
    });

    it('should withdraw', async () => {
        //await blockchain.setVerbosityForAddress(pool.address, {blockchainLogs:true, vmLogs: 'vm_logs'});
        let myPoolJettonWalletAddress = await poolJetton.getWalletAddress(deployer.address);
        let myPoolJettonWallet = blockchain.openContract(PoolJettonWallet.createFromAddress(myPoolJettonWalletAddress));
        const jettonAmount = await myPoolJettonWallet.getJettonBalance();

        const burnResult = await myPoolJettonWallet.sendBurnWithParams(deployer.getSender(), toNano('1.0'), jettonAmount, deployer.address, false, false);


        expect(burnResult.transactions).toHaveTransaction({
            on: deployer.address,
            op: 0x05138d91, // excesses
            success: true,
        });

    });

    it('should pay out tons', async () => {

        let payout = blockchain.openContract(await pool.getWithdrawalMinter());

        // rotate round another time
        const confDict = loadConfig(blockchain.config);
        confDict.set(34, beginCell().storeUint(0x12, 8).storeUint(0, 32).storeUint(0xffffffef, 32).endCell());
        blockchain.setConfig(beginCell().storeDictDirect(confDict).endCell());
        //touch pool to trigger rotate
        //await blockchain.setVerbosityForAddress(pool.address, {blockchainLogs:true, vmLogs: 'vm_logs'});
        const roundRotateResult = await pool.sendDeposit(deployer.getSender(), toNano('1000000'));

        expect(roundRotateResult.transactions).toHaveTransaction({
            from: pool.address,
            op: 0x1140a64f, // start_distribution (new)
            success: true,
        });

        expect(roundRotateResult.transactions).toHaveTransaction({
            from: payout.address,
            on: deployer.address,
            op: 0xdb3b8abd, // distribution
            success: true,
        });

    });

    it('should deposit', async () => {
        let confDict = loadConfig(blockchain.config);
        confDict.set(34, beginCell().storeUint(0x12, 8).storeUint(0, 32).storeUint(0xfffffdcf, 32).endCell());
        blockchain.setConfig(beginCell().storeDictDirect(confDict).endCell());
        //touch pool to trigger rotate
        let touchResult = await pool.sendTouch(deployer.getSender());


        //await blockchain.setVerbosityForAddress(pool.address, {blockchainLogs:true, vmLogs: 'vm_logs'});
        let myPoolJettonWalletAddress = await poolJetton.getWalletAddress(deployer.address);
        let myPoolJettonWallet = blockchain.openContract(PoolJettonWallet.createFromAddress(myPoolJettonWalletAddress));
        const jettonAmount1 = await myPoolJettonWallet.getJettonBalance();
        await pool.sendDeposit(deployer.getSender(), toNano('2'));
        await pool.sendDeposit(deployer.getSender(), toNano('3'));
        await pool.sendDeposit(deployer.getSender(), toNano('4'));
        await pool.sendDeposit(deployer.getSender(), toNano('5'));
        await pool.sendDeposit(deployer.getSender(), toNano('6'));


        confDict = loadConfig(blockchain.config);
        confDict.set(34, beginCell().storeUint(0x12, 8).storeUint(0, 32).storeUint(0xfffffdef, 32).endCell());
        blockchain.setConfig(beginCell().storeDictDirect(confDict).endCell());
        //touch pool to trigger rotate
        //await blockchain.setVerbosityForAddress(pool.address, {blockchainLogs:true, vmLogs: 'vm_logs'});
        touchResult = await pool.sendTouch(deployer.getSender());

        const jettonAmount2 = await myPoolJettonWallet.getJettonBalance();
        let data = await pool.getFinanceData();

        expect((1n + jettonAmount2 - jettonAmount1)*data.totalBalance/data.supply).toBe(toNano('15.0'));

    });
});