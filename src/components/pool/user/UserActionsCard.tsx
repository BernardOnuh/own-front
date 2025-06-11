import React, { useState, useEffect } from "react";
import { Button, Card, Input } from "@/components/ui/BaseComponents";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/TabsComponents";
import {
  ArrowUpDown,
  Info,
  Wallet,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Pool } from "@/types/pool";
import { UserData } from "@/types/user";
import { useUserPoolManagement } from "@/hooks/user";
import {
  calculateAvailableLiquidity,
  doesDepositExceedLiquidity,
  formatLiquidityAmount,
} from "@/utils/liquidity";
import toast from "react-hot-toast";

interface UserActionsCardProps {
  pool: Pool;
  userData: UserData;
}

export const UserActionsCard: React.FC<UserActionsCardProps> = ({
  pool,
  userData,
}) => {
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [requiredCollateral, setRequiredCollateral] = useState<string>("0");
  const [liquidityError, setLiquidityError] = useState<string>("");
  const { isLoading: isUserDataLoading, error: userDataError, userRequest } = userData;

  // Check if pool is active
  const isPoolActive = pool.poolStatus === "ACTIVE";

  // Calculate available liquidity
  const liquidityData = calculateAvailableLiquidity(pool);

  // Check if user has a pending request in the current cycle
  const hasPendingRequest = Boolean(userRequest && 
    (userRequest.requestType === "DEPOSIT" || userRequest.requestType === "REDEEM") &&
    Number(userRequest.requestCycle) >= Number(pool.currentCycle));

  // Use the hook for contract interactions
  const {
    depositRequest,
    redemptionRequest,
    checkReserveApproval,
    checkAssetApproval,
    approveReserve,
    approveAsset,
    checkSufficientReserveBalance,
    checkSufficientAssetBalance,
    isLoading,
    error,
    reserveBalance,
    assetBalance,
    isLoadingReserveBalance,
    isLoadingAssetBalance,
    reserveApproved,
    assetApproved,
  } = useUserPoolManagement(
    pool.address,
    pool.reserveTokenAddress,
    pool.reserveTokenDecimals,
    pool.assetTokenAddress,
    18 // asset token decimals
  );

  // Calculate required collateral amount when deposit amount changes
  useEffect(() => {
    if (!depositAmount || isNaN(Number(depositAmount))) {
      setRequiredCollateral("0");
      setLiquidityError("");
      return;
    }

    // Get the user healthy collateral ratio from the pool's strategy
    const userHealthyCollateralRatio = pool.userHealthyCollateralRatio || 2000;

    // Calculate required collateral: amount * (ratio / BPS)
    const calculatedCollateral = (
      (Number(depositAmount) * userHealthyCollateralRatio) /
      10000
    ).toString();

    setRequiredCollateral(calculatedCollateral);

    // Check if deposit exceeds available liquidity
    if (
      doesDepositExceedLiquidity(
        depositAmount,
        liquidityData.availableLiquidity
      )
    ) {
      setLiquidityError(
        `Deposit amount exceeds available liquidity. Maximum available: ${formatLiquidityAmount(
          liquidityData.availableLiquidity,
          pool.reserveToken
        )}`
      );
    } else {
      setLiquidityError("");
    }
  }, [
    depositAmount,
    pool.userHealthyCollateralRatio,
    liquidityData.availableLiquidity,
    pool.reserveToken,
  ]);

  // Check approval status when amounts change
  useEffect(() => {
    const checkApprovals = async () => {
      if (depositAmount && Number(depositAmount) > 0 && !liquidityError && !hasPendingRequest) {
        const totalAmount = (
          Number(depositAmount) + Number(requiredCollateral)
        ).toString();
        await checkReserveApproval(totalAmount);
      }

      if (redeemAmount && Number(redeemAmount) > 0 && !hasPendingRequest) {
        await checkAssetApproval(redeemAmount);
      }
    };

    checkApprovals();
  }, [
    depositAmount,
    redeemAmount,
    requiredCollateral,
    liquidityError,
    hasPendingRequest,
    checkReserveApproval,
    checkAssetApproval,
  ]);

  const handleDeposit = async () => {
    if (!depositAmount) {
      toast.error("Please enter an amount");
      return;
    }

    if (liquidityError) {
      toast.error("Deposit exceeds available liquidity");
      return;
    }

    if (hasPendingRequest) {
      toast.error("You can only have one request per cycle");
      return;
    }

    try {
      await depositRequest(depositAmount, requiredCollateral);
      setDepositAmount("");
    } catch (error) {
      console.error("Deposit error:", error);
    }
  };

  const handleApproveDeposit = async () => {
    if (!depositAmount) {
      toast.error("Please enter an amount");
      return;
    }

    if (liquidityError) {
      toast.error("Cannot approve: deposit exceeds available liquidity");
      return;
    }

    if (hasPendingRequest) {
      toast.error("You can only have one request per cycle");
      return;
    }

    try {
      const totalAmount = (
        Number(depositAmount) + Number(requiredCollateral)
      ).toString();
      await approveReserve(totalAmount);
    } catch (error) {
      console.error("Approval error:", error);
    }
  };

  const handleApproveRedeem = async () => {
    if (!redeemAmount) {
      toast.error("Please enter an amount");
      return;
    }

    if (hasPendingRequest) {
      toast.error("You can only have one request per cycle");
      return;
    }

    try {
      await approveAsset(redeemAmount);
    } catch (error) {
      console.error("Approval error:", error);
    }
  };

  const handleRedeem = async () => {
    if (!redeemAmount) {
      toast.error("Please enter an amount");
      return;
    }

    if (hasPendingRequest) {
      toast.error("You can only have one request per cycle");
      return;
    }

    try {
      await redemptionRequest(redeemAmount);
      setRedeemAmount("");
    } catch (error) {
      console.error("Redeem error:", error);
      toast.error("Error processing redemption");
    }
  };

  const isDepositable = isPoolActive && !isLoading && !liquidityError && !hasPendingRequest;
  const isRedeemable = isPoolActive && !isLoading && !hasPendingRequest;

  // Check if there's enough balance for the current action
  const hasEnoughDepositBalance =
    depositAmount && requiredCollateral
      ? checkSufficientReserveBalance(
          (Number(depositAmount) + Number(requiredCollateral)).toString()
        )
      : false;

  const renderDepositContent = () => (
    <TabsContent value="deposit" className="mt-4 space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <Input
            type="number"
            placeholder="Amount to deposit"
            value={depositAmount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDepositAmount(e.target.value)
            }
            disabled={hasPendingRequest}
            className={`px-2 h-12 bg-slate-600/50 border-slate-700 text-gray-400 placeholder:text-gray-400 ${
              liquidityError ? "border-red-500" : ""
            } ${hasPendingRequest ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          <div className="flex items-center justify-between px-2">
            <span className="text-sm text-slate-400">
              Balance:{" "}
              {isLoadingReserveBalance ? (
                <Loader2 className="w-3 h-3 inline animate-spin ml-1" />
              ) : (
                `${reserveBalance} ${pool.reserveToken}`
              )}
            </span>
            {depositAmount && !hasEnoughDepositBalance && !liquidityError && !hasPendingRequest && (
              <span className="text-sm text-red-400">Insufficient balance</span>
            )}
            {error && !liquidityError && !hasPendingRequest && (
              <span className="text-sm text-red-400">{error.message}</span>
            )}
          </div>

          {/* Liquidity Error Message */}
          {liquidityError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-500/10 p-2 rounded text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{liquidityError}</span>
            </div>
          )}

          {/* Pending Request Warning */}
          {hasPendingRequest && (
            <div className="flex items-center gap-2 text-yellow-400 bg-yellow-500/10 p-2 rounded text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>You can only have one request per cycle</span>
            </div>
          )}
        </div>

        <div className="p-3 bg-blue-500/10 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-300">Required Collateral:</span>
            <span className="text-sm font-medium text-blue-400">
              {requiredCollateral} {pool.reserveToken}
            </span>
          </div>
          <div className="group relative mt-1">
            <span className="text-xs text-gray-400 cursor-help underline decoration-dotted">
              Learn more
            </span>
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
              Collateral is used to pay the pool interest. You need to maintain
              sufficient collateral to avoid liquidation. The total amount
              deposited is the sum of the deposit amount and the required
              collateral.
            </div>
          </div>
        </div>

        {!reserveApproved ? (
          <Button
            onClick={handleApproveDeposit}
            disabled={
              !isDepositable ||
              !depositAmount ||
              !hasEnoughDepositBalance ||
              !!liquidityError ||
              hasPendingRequest
            }
            className="w-full h-12 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Wallet className="w-4 h-4 mr-2" />
            Approve {pool.reserveToken}
          </Button>
        ) : (
          <Button
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleDeposit}
            disabled={
              !isDepositable ||
              !depositAmount ||
              !hasEnoughDepositBalance ||
              !!liquidityError ||
              hasPendingRequest
            }
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Wallet className="w-4 h-4 mr-2" />
            Deposit {pool.reserveToken}
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-400 flex items-center">
        <Info className="w-4 h-4 mr-1" />
        {hasPendingRequest
          ? "You can only have one request per cycle"
          : isPoolActive
          ? "Deposits include collateral and are processed at the end of each cycle"
          : `Pool is currently ${pool.poolStatus.toLowerCase()}. Actions are disabled.`}
      </p>
    </TabsContent>
  );

  // Show loading state
  if (isUserDataLoading) {
    return (
      <Card className="bg-white/10 border-gray-800 rounded-lg p-4">
        <div className="flex justify-center items-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </Card>
    );
  }

  if (userDataError) {
    return (
      <Card className="bg-white/10 border-gray-800 rounded-lg p-4">
        <div className="text-center text-red-500">
          Error loading user data. Please try again later.
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-white/10 border-gray-800 rounded-lg p-2">
      <Tabs defaultValue="deposit" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 p-1">
          <TabsTrigger
            value="deposit"
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-300"
          >
            Deposit
          </TabsTrigger>
          <TabsTrigger
            value="redeem"
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-300"
          >
            Redeem
          </TabsTrigger>
        </TabsList>

        {renderDepositContent()}

        <TabsContent value="redeem" className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <Input
                type="number"
                placeholder="Amount to redeem"
                value={redeemAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRedeemAmount(e.target.value)
                }
                disabled={!isPoolActive || hasPendingRequest}
                className={`px-2 h-12 bg-slate-600/50 border-slate-700 text-gray-400 placeholder:text-gray-400 ${
                  hasPendingRequest ? "opacity-50 cursor-not-allowed" : ""
                }`}
              />
              <div className="flex items-center justify-between px-2">
                <span className="text-sm text-slate-400">
                  Balance:{" "}
                  {isLoadingAssetBalance ? (
                    <Loader2 className="w-3 h-3 inline animate-spin ml-1" />
                  ) : (
                    `${assetBalance} ${pool.assetTokenSymbol}`
                  )}
                </span>
                {redeemAmount && !checkSufficientAssetBalance(redeemAmount) && !hasPendingRequest && (
                  <span className="text-sm text-red-400">
                    Insufficient balance
                  </span>
                )}
              </div>

              {/* Pending Request Warning for Redeem */}
              {hasPendingRequest && (
                <div className="flex items-center gap-2 text-yellow-400 bg-yellow-500/10 p-2 rounded text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>You can only have one request per cycle</span>
                </div>
              )}
            </div>

            {!assetApproved ? (
              <Button
                onClick={handleApproveRedeem}
                disabled={
                  !isRedeemable ||
                  !redeemAmount ||
                  !checkSufficientAssetBalance(redeemAmount) ||
                  hasPendingRequest
                }
                className="w-full h-12 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Wallet className="w-4 h-4 mr-2" />
                Approve {pool.assetTokenSymbol}
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="w-full h-12 bg-slate-700 hover:bg-slate-600 text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRedeem}
                disabled={
                  !isRedeemable ||
                  !redeemAmount ||
                  !checkSufficientAssetBalance(redeemAmount) ||
                  hasPendingRequest
                }
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Redeem {pool.assetTokenSymbol}
              </Button>
            )}
          </div>
          <p className="text-sm text-slate-400 flex items-center">
            <Info className="w-4 h-4 mr-1" />
            {hasPendingRequest
              ? "You can only have one request per cycle"
              : isPoolActive
              ? "Redemptions are processed at the end of each cycle"
              : `Pool is currently ${pool.poolStatus.toLowerCase()}. Actions are disabled.`}
          </p>
        </TabsContent>
      </Tabs>
    </Card>
  );
};