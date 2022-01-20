const { expect } = require("chai");
const { ethers } = require("hardhat");

function getCreate2Address(
  factoryAddress,
  [tokenA, tokenB],
  bytecode
) {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    keccak256(solidityPack(['address', 'address'], [token0, token1])),
    keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

describe("BaseV1Factory", function () {

  let token;
  let ust;
  let mim;
  let ve_underlying;
  let ve;
  let factory;
  let router;
  let pair;
  let pair2;
  let owner;
  let gauge_factory;
  let gauge;
  let bribe;
  let minter;
  let ve_dist;
  let library;

  it("deploy base coins", async function () {
    [owner] = await ethers.getSigners();
    token = await ethers.getContractFactory("Token");
    ust = await token.deploy('ust', 'ust', 6, owner.address);
    await ust.mint(owner.address, ethers.BigNumber.from("1000000000000000"));
    mim = await token.deploy('MIM', 'MIM', 18, owner.address);
    await mim.mint(owner.address, ethers.BigNumber.from("1000000000000000000000"));
    ve_underlying = await token.deploy('VE', 'VE', 18, owner.address);
    await ve_underlying.mint(owner.address, ethers.BigNumber.from("1000000000000000000000"));
    vecontract = await ethers.getContractFactory("contracts/ve.sol:ve");
    ve = await vecontract.deploy(ve_underlying.address);

    await ust.deployed();
    await mim.deployed();
  });

  it("confirm ust deployment", async function () {
    expect(await ust.name()).to.equal("ust");
  });

  it("confirm mim deployment", async function () {
    expect(await mim.name()).to.equal("MIM");
  });

  it("deploy BaseV1Factory and test pair length", async function () {
    const BaseV1Factory = await ethers.getContractFactory("BaseV1Factory");
    factory = await BaseV1Factory.deploy();
    await factory.deployed();

    expect(await factory.allPairsLength()).to.equal(0);
  });

  it("deploy BaseV1Router and test factory address", async function () {
    const BaseV1Router = await ethers.getContractFactory("BaseV1Router01");
    router = await BaseV1Router.deploy(factory.address, owner.address);
    await router.deployed();

    expect(await router.factory()).to.equal(factory.address);
  });

  it("deploy pair via BaseV1Factory", async function () {
    const ust_1 = ethers.BigNumber.from("1000000");
    const mim_1 = ethers.BigNumber.from("1000000000000000000");
    await mim.approve(router.address, mim_1);
    await ust.approve(router.address, ust_1);
    await router.addLiquidity(mim.address, ust.address, true, mim_1, ust_1, 0, 0, owner.address, Date.now());
    await mim.approve(router.address, mim_1);
    await ust.approve(router.address, ust_1);
    await router.addLiquidity(mim.address, ust.address, false, mim_1, ust_1, 0, 0, owner.address, Date.now());
    expect(await factory.allPairsLength()).to.equal(2);
  });

  it("confirm pair for mim-ust", async function () {
    const create2address = await router.pairFor(mim.address, ust.address, true);
    const BaseV1Pair = await ethers.getContractFactory("BaseV1Pair");
    const address = await factory.getPair(mim.address, ust.address, true);
    const allpairs0 = await factory.allPairs(0);
    pair = await BaseV1Pair.attach(address);
    const address2 = await factory.getPair(mim.address, ust.address, false);
    pair2 = await BaseV1Pair.attach(address2);

    expect(pair.address).to.equal(create2address);
  });

  it("confirm tokens for mim-ust", async function () {
    [token0, token1] = await router.sortTokens(ust.address, mim.address);
    expect((await pair.token0()).toUpperCase()).to.equal(token0.toUpperCase());
    expect((await pair.token1()).toUpperCase()).to.equal(token1.toUpperCase());
  });

  it("mint & burn tokens for pair mim-ust", async function () {
    const ust_1 = ethers.BigNumber.from("1000000");
    const mim_1 = ethers.BigNumber.from("1000000000000000000");
    const before_balance = await ust.balanceOf(owner.address);
    await ust.transfer(pair.address, ust_1);
    await mim.transfer(pair.address, mim_1);
    await pair.mint(owner.address);
    console.log(await pair.getAmountOut(ust_1, ust.address));

    /*await pair.transfer(pair.address, await pair.balanceOf(owner.address));
    await pair.burn(owner.address);
    expect(await ust.balanceOf(owner.address)).to.equals(before_balance-1);*/
  });

  it("BaseV1Router01 addLiquidity", async function () {
    const ust_1000 = ethers.BigNumber.from("100000000");
    const mim_1000 = ethers.BigNumber.from("100000000000000000000");
    const expected_2000 = ethers.BigNumber.from("2000000000");
    await ust.approve(router.address, ust_1000);
    await mim.approve(router.address, mim_1000);
    await router.addLiquidity(mim.address, ust.address, true, mim_1000, ust_1000, mim_1000, ust_1000, owner.address, Date.now());
    await ust.approve(router.address, ust_1000);
    await mim.approve(router.address, mim_1000);
    await router.addLiquidity(mim.address, ust.address, false, mim_1000, ust_1000, mim_1000, ust_1000, owner.address, Date.now());
  });

  it("BaseV1Router01 pair1 getAmountsOut & swapExactTokensForTokens", async function () {
    const ust_1 = ethers.BigNumber.from("1000000");
    const route = {from:ust.address, to:mim.address, stable:true}

    console.log(await router.getAmountsOut(ust_1, [route]));
    console.log(await pair.getAmountOut(ust_1, ust.address));

    const before = await mim.balanceOf(owner.address);
    const expected_output_pair = await pair.getAmountOut(ust_1, ust.address);
    const expected_output = await router.getAmountsOut(ust_1, [route]);
    await ust.approve(router.address, ust_1);
    await router.swapExactTokensForTokens(ust_1, expected_output[1], [route], owner.address, Date.now());
    const fees = await pair.fees()
    console.log(await ust.balanceOf(fees));
    console.log(await ust.balanceOf(owner.address));
    await pair.claimFees();
    console.log(await ust.balanceOf(owner.address));
  });

  it("BaseV1Router01 pair2 getAmountsOut & swapExactTokensForTokens", async function () {
    const ust_1 = ethers.BigNumber.from("1000000");
    const route = {from:ust.address, to:mim.address, stable:false}

    console.log(await router.getAmountsOut(ust_1, [route]));
    console.log(await pair2.getAmountOut(ust_1, ust.address));

    const before = await mim.balanceOf(owner.address);
    const expected_output_pair = await pair.getAmountOut(ust_1, ust.address);
    const expected_output = await router.getAmountsOut(ust_1, [route]);
    await ust.approve(router.address, ust_1);
    await router.swapExactTokensForTokens(ust_1, expected_output[1], [route], owner.address, Date.now());
  });

  it("deploy BaseV1Voter", async function () {
    const BaseV1GaugeFactory = await ethers.getContractFactory("BaseV1GaugeFactory");
    gauges_factory = await BaseV1GaugeFactory.deploy();
    const BaseV1Voter = await ethers.getContractFactory("BaseV1Voter");
    gauge_factory = await BaseV1Voter.deploy(ve.address, factory.address, gauges_factory.address);
    await gauge_factory.deployed();

    expect(await gauge_factory.length()).to.equal(0);
  });

  it("deploy BaseV1Minter", async function () {

    const VeDist = await ethers.getContractFactory("contracts/ve_dist.sol:ve_dist");
    ve_dist = await VeDist.deploy();
    await ve_dist.deployed();

    const BaseV1Minter = await ethers.getContractFactory("BaseV1Minter");
    minter = await BaseV1Minter.deploy(gauge_factory.address, ve.address, ve_dist.address);
    await minter.deployed();
  });

  it("deploy BaseV1Factory gauge", async function () {
    const pair_1000 = ethers.BigNumber.from("1000000000");

    await gauge_factory.createGauge(pair.address);
    expect(await gauge_factory.gauges(pair.address)).to.not.equal(0x0000000000000000000000000000000000000000);

    const gauge_address = await gauge_factory.gauges(pair.address);
    const bribe_address = await gauge_factory.bribes(gauge_address);

    const Gauge = await ethers.getContractFactory("Gauge");
    gauge = await Gauge.attach(gauge_address);

    const Bribe = await ethers.getContractFactory("Bribe");
    bribe = await Bribe.attach(bribe_address);

    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    expect(await gauge.totalSupply()).to.equal(pair_1000);
    expect(await gauge.earned(ve.address, owner.address)).to.equal(0);
  });

  it("withdraw gauge stake", async function () {
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    expect(await gauge.totalSupply()).to.equal(0);
  });

  it("add gauge & bribe rewards", async function () {
    const pair_1000 = ethers.BigNumber.from("1000000000");

    await ve_underlying.approve(gauge.address, pair_1000);
    await ve_underlying.approve(bribe.address, pair_1000);

    await gauge.notifyRewardAmount(ve_underlying.address, pair_1000);
    await bribe.notifyRewardAmount(ve_underlying.address, pair_1000);
    console.log(await bribe.rewardPerToken(ve_underlying.address));

    expect(await gauge.rewardRate(ve_underlying.address)).to.equal(ethers.BigNumber.from(1653));
    expect(await bribe.rewardRate(ve_underlying.address)).to.equal(ethers.BigNumber.from(1653));
  });

  it("exit & getReward gauge stake", async function () {
    const pair_1000 = ethers.BigNumber.from("1000000000");
    const supply = await pair.balanceOf(owner.address);
    await pair.approve(gauge.address, supply);
    await gauge.deposit(supply, owner.address);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    expect(await gauge.totalSupply()).to.equal(0);
    await pair.approve(gauge.address, supply);
    await gauge.deposit(supply, owner.address);
  });

  it("gauge reset", async function () {
    await gauge_factory.reset(1);
  });

  it("gauge poke self", async function () {
    await gauge_factory.poke(1);
  });

  it("gauge vote & bribe balanceOf", async function () {
    await gauge_factory.vote(1, [pair.address, pair2.address], [5000,5000]);
    expect(await gauge_factory.totalWeight()).to.not.equal(0);
    expect(await bribe.balanceOf(1)).to.not.equal(0);
  });

  it("gauge distribute based on voting", async function () {
    const pair_1000 = ethers.BigNumber.from("1000000000");
    await ve_underlying.approve(gauge_factory.address, pair_1000);
    await gauge_factory.notifyRewardAmount(pair_1000);
    await gauge_factory.updateAll();
    await gauge_factory.distro();
  });

  it("bribe claim rewards", async function () {
    console.log(await bribe.rewardPerToken(ve_underlying.address));
    console.log(await ve_underlying.balanceOf(bribe.address));
    console.log(await bribe.earned(ve_underlying.address, 1));
    await bribe.getReward(1, [ve_underlying.address]);
    await network.provider.send("evm_increaseTime", [691200])
    await network.provider.send("evm_mine")
    console.log(await ve_underlying.balanceOf(bribe.address));
    console.log(await bribe.earned(ve_underlying.address, 1));
    await bribe.getReward(1, [ve_underlying.address]);
  });

  it("BaseV1Router01 pair1 getAmountsOut & swapExactTokensForTokens", async function () {
    const ust_1 = ethers.BigNumber.from("1000000");
    const route = {from:ust.address, to:mim.address, stable:true}

    console.log(await router.getAmountsOut(ust_1, [route]));
    console.log(await pair.getAmountOut(ust_1, ust.address));

    const before = await mim.balanceOf(owner.address);
    const expected_output_pair = await pair.getAmountOut(ust_1, ust.address);
    const expected_output = await router.getAmountsOut(ust_1, [route]);
    await ust.approve(router.address, ust_1);
    await router.swapExactTokensForTokens(ust_1, expected_output[1], [route], owner.address, Date.now());
    const fees = await pair.fees()
    console.log(await ust.balanceOf(fees));
  });

  it("BaseV1Router01 pair2 getAmountsOut & swapExactTokensForTokens", async function () {
    const ust_1 = ethers.BigNumber.from("1000000");
    const route = {from:ust.address, to:mim.address, stable:false}

    console.log(await router.getAmountsOut(ust_1, [route]));
    console.log(await pair2.getAmountOut(ust_1, ust.address));

    const before = await mim.balanceOf(owner.address);
    const expected_output_pair = await pair.getAmountOut(ust_1, ust.address);
    const expected_output = await router.getAmountsOut(ust_1, [route]);
    await ust.approve(router.address, ust_1);
    await router.swapExactTokensForTokens(ust_1, expected_output[1], [route], owner.address, Date.now());
    const fees = await pair2.fees()
    console.log(await ust.balanceOf(fees));
  });

  it("BaseV1Router01 pair1 getAmountsOut & swapExactTokensForTokens", async function () {
    const mim_1 = ethers.BigNumber.from("1000000000000000000");
    const route = {from:mim.address, to:ust.address, stable:true}
    console.log(await pair.getReserves());

    console.log(await pair.getAmountOut(mim_1, mim.address));
    console.log(await router.getAmountsOut(mim_1, [route]));

    const before = await ust.balanceOf(owner.address);
    const expected_output_pair = await pair.getAmountOut(mim_1, mim.address);
    const expected_output = await router.getAmountsOut(mim_1, [route]);
    await mim.approve(router.address, mim_1);
    await router.swapExactTokensForTokens(mim_1, expected_output[1], [route], owner.address, Date.now());
    const fees = await pair.fees()
    console.log(await mim.balanceOf(fees));
  });

  it("BaseV1Router01 pair2 getAmountsOut & swapExactTokensForTokens", async function () {
    const mim_1 = ethers.BigNumber.from("1000000000000000000");
    const route = {from:mim.address, to:ust.address, stable:false}
    console.log(await pair2.stable());

    console.log(await router.getAmountsOut(mim_1, [route]));
    console.log(await pair2.getAmountOut(mim_1, mim.address));

    const before = await ust.balanceOf(owner.address);
    const expected_output_pair = await pair2.getAmountOut(mim_1, mim.address);
    const expected_output = await router.getAmountsOut(mim_1, [route]);
    await mim.approve(router.address, mim_1);
    await router.swapExactTokensForTokens(mim_1, expected_output[1], [route], owner.address, Date.now());
    const fees = await pair2.fees()
    console.log(await mim.balanceOf(fees));
  });

  it("distribute and claim fees", async function () {

    await gauge_factory.distributeFees([gauge.address]);
    console.log(await bribe.earned(ust.address, 1));
    console.log(await ust.balanceOf(bribe.address));
    console.log(await bribe.balanceOf(1));
    console.log(await bribe.numCheckpoints(1));
    console.log(await bribe.rewardPerToken(ust.address));
    await network.provider.send("evm_increaseTime", [691200])
    await network.provider.send("evm_mine")
    console.log(await bribe.earned(ust.address, 1));
    await bribe.getReward(1, [mim.address, ust.address]);
  });

  it("minter mint", async function () {
    await minter.update_period();
    await gauge_factory.distro();
  });

  it("gauge claim rewards", async function () {
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    const pair_1000 = ethers.BigNumber.from("1000000000");
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await gauge.getReward(owner.address, [ve_underlying.address]);
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await network.provider.send("evm_increaseTime", [604800])
    await network.provider.send("evm_mine")
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
  });

  it("gauge claim rewards (after expiry)", async function () {
    const pair_1000 = ethers.BigNumber.from("1000000000");
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
    await pair.approve(gauge.address, pair_1000);
    await gauge.deposit(pair_1000, owner.address);
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await gauge.getReward(owner.address, [ve_underlying.address]);
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await network.provider.send("evm_increaseTime", [604800])
    await network.provider.send("evm_mine")
    console.log(await gauge.earned(ve_underlying.address, owner.address));
    await gauge.getReward(owner.address, [ve_underlying.address]);
    await gauge.withdraw(await gauge.balanceOf(owner.address));
  });

});
