import { BN, Zilliqa, normaliseAddress } from "@zilliqa-js/zilliqa";
import { makeAutoObservable, runInAction } from "mobx";
// import { monitor } from "../util/ContractMonitor";
import { ByStr20, partialState } from "boost-zil";
import { addressbook } from "../data/addressbook";
import { getNoSignerZil } from "../util/config";
import { Big } from "big.js";
import { FungibleToken } from "../bind/FungibleToken/build/bind";
import { getNetworkName, getVersion } from "../util/config";

function BNtoDisp(b: BN, decimals: number, precision = 6): string {
    const base = new Big(b.toString()).div(new Big(10).pow(decimals));
    return base.toFixed(precision);
}

const tokens = [
    addressbook.ethTOKEN,
    addressbook.btcTOKEN,
    addressbook.usdTOKEN,
];

const sellers = [
    addressbook.ETH_SELLER,
    addressbook.BTC_SELLER,
    addressbook.USDT_SELLER,
];

class WalletManager {
    connected: boolean = false;
    private zeth: BN = new BN(0);
    private zwbtc: BN = new BN(0);
    private zusdt: BN = new BN(0);
    private zethPrice: BN = new BN(0);
    private zwbtcPrice: BN = new BN(0);
    private zusdtPrice: BN = new BN(0);
    owned: string[] = [];
    saleOpen: boolean = true;

    get zethB() {
        return BNtoDisp(this.zeth, 18);
    }
    get zwbtcB() {
        return BNtoDisp(this.zwbtc, 8);
    }
    get zusdtB() {
        return BNtoDisp(this.zusdt, 6);
    }

    get zethP() {
        return BNtoDisp(this.zethPrice, 18);
    }
    get zwbtcP() {
        return BNtoDisp(this.zwbtcPrice, 8);
    }
    get zusdtP() {
        return BNtoDisp(this.zusdtPrice, 6);
    }

    constructor() {
        makeAutoObservable(this);
    }

    private thereIsZilPay() {
        if (typeof window != "undefined") {
            if (typeof window.zilPay != "undefined") {
                return true;
            }
        }
        return false;
    }
    private getZilPay() {
        if (this.thereIsZilPay()) {
            return window.zilPay;
        }
        throw new Error("no zilpay");
    }

    async updatePrices() {
        //@ts-expect-error
        const states = await partialState(async () => getNoSignerZil())(
            ...sellers.map((t) => ({
                contractAddress: t,
                includeInit: "false" as "false",
                query: {
                    nft_price: "*" as "*",
                },
            }))
        );
        console.log(states);
        //@ts-expect-error
        const prices = states.map((s) => new BN(s.nft_price));
        runInAction(() => {
            this.zethPrice = prices[0];
            this.zwbtcPrice = prices[1];
            this.zusdtPrice = prices[2];
        });
    }
    async update() {
        if (this.thereIsZilPay() && this.getZilPay().wallet.defaultAccount) {
            const addr = normaliseAddress(
                this.getZilPay().wallet.defaultAccount.base16
            );
            if (addr) {
                //@ts-expect-error
                const states = await partialState(async () => getNoSignerZil())(
                    ...tokens.map((t) => ({
                        contractAddress: t,
                        includeInit: "false" as "false",
                        query: {
                            balances: { [addr]: "*" as "*" },
                        },
                    })),
                    {
                        contractAddress: addressbook.ZILMORPHS_ADDRESS,
                        includeInit: "false",
                        //@ts-expect-error
                        query: { token_owners: "*" },
                    },
                    {
                        contractAddress: addressbook.BTC_SELLER,
                        includeInit: "false",
                        query: { sale_active: "*" },
                    }
                );
                const stat = states.splice(0, 3) as unknown as {
                    balances: { [k: string]: undefined | string };
                }[];
                const processed = stat.map((s) =>
                    typeof s.balances[addr] == "undefined"
                        ? new BN(0)
                        : new BN(s.balances[addr])
                );
                console.log(processed);
                // the owners of token
                console.log(states);
                const token_ids = Object.entries(states.shift().token_owners)
                    .filter(([id, address]) => ByStr20.areEqual(address, addr))
                    .map(([id, address]) => id);

                // the btc seller sale active
                const btcseller = states.shift();
                console.log(btcseller);
                //@ts-expect-error
                const saleOpen = btcseller.sale_active.constructor != "False";
                runInAction(() => {
                    this.zeth = processed[0];
                    this.zwbtc = processed[1];
                    this.zusdt = processed[2];
                    this.owned = token_ids;
                    this.saleOpen = saleOpen;
                });
            }
        }
    }
    async aquireWallet() {
        if (this.thereIsZilPay()) {
            const connected = await this.getZilPay().wallet.connect();
            runInAction(() => {
                this.connected = connected;
            });
            console.debug({ connected });
            if (connected) {
                this.updatePrices();
                this.update();
                return window.zilPay as unknown as Zilliqa;
            } else {
                throw new Error("zilpay not connected");
            }
        }
        window.open("https://zilpay.io/");
        throw new Error("No zilpay");
    }
    async silentConnect() {
        try {
            await this.aquireWallet();
        } catch (e) {}
    }
    // subscribe() {
    //     this.update();
    //     return monitor.onNewContractTx(() => this.update());
    // }
}

var tokenSdk = FungibleToken({
    getNetworkName,
    getVersion,
    getZil: async (signer) => {
        if (signer) {
            const zil = await walletManager.aquireWallet();
            return { zil, teardown: async () => {} };
        } else {
            return { zil: getNoSignerZil(), teardown: async () => {} };
        }
    },
});

export const walletManager = new WalletManager();

export const getZil = async (signer: boolean) => {
    return { zil: walletManager.aquireWallet(), teardown: async () => {} };
};
