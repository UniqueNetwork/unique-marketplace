// Copyright 2017-2022 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import './styles.scss';

import BN from 'bn.js';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from 'semantic-ui-react/dist/commonjs/elements/Button';
import Header from 'semantic-ui-react/dist/commonjs/elements/Header';
import Image from 'semantic-ui-react/dist/commonjs/elements/Image';
import Loader from 'semantic-ui-react/dist/commonjs/elements/Loader';

import envConfig from '@polkadot/apps-config/envConfig';
import { PlaceABetModal } from '@polkadot/react-components';
import { useApi, useBalance, useDecoder, useMarketplaceStages, useSchema } from '@polkadot/react-hooks';
import { shortAddress, subToEth } from '@polkadot/react-hooks/utils';
import { OfferType } from '@polkadot/react-hooks/useCollections';

import BuySteps from './BuySteps';
import SaleSteps from './SaleSteps';
import logoKusama from '../../../../packages/apps/public/logos/kusama.svg';
import clock from '../../../../packages/apps/public/icons/clock.svg';
import { useTimeToFinishAuction } from '@polkadot/react-hooks/useTimeToFinishAuction';
import Table, { TColor, TSize } from '../Table2/TableContainer';
import Text from '../UIKitComponents/Text/Text';
import { useBidStatus } from '@polkadot/react-hooks/useBidStatus';
import { useSettings } from '@polkadot/react-api/useSettings';
import { adaptiveFixed, getBidsFromAccount, getFormatedBidsTime } from '../util';
import { TCalculatedBid, useAuctionApi } from '@polkadot/react-api/useAuctionApi';
import { useHistory } from "react-router-dom"
import Timer from '../Timer';

interface NftDetailsAuctionProps {
  account: string;
  getOffer: (collectionId: string, tokenId: string) => Promise<never[] | 0>; // todo exchange to offer from socket
  offer: OfferType;
}

function NftDetailsAuction({ account, getOffer, offer }: NftDetailsAuctionProps): React.ReactElement<NftDetailsAuctionProps> {

  const query = new URLSearchParams(useLocation().search);
  const tokenId = query.get('tokenId') || '';
  const collectionId = query.get('collectionId') || '';
  const [showBetForm, setShowBetForm] = useState<boolean>(false);
  const [ethAccount, setEthAccount] = useState<string>();
  const [fee, setFee] = useState<BN>();
  const { balance } = useBalance(account);
  const { hex2a } = useDecoder();
  const { attributes, collectionInfo, tokenUrl } = useSchema(account, collectionId, tokenId);
  const { formatKsmBalance, getKusamaTransferFee, kusamaAvailableBalance, sendCurrentUserAction,
    tokenAsk, tokenInfo, transferStep } = useMarketplaceStages(account, ethAccount, collectionInfo, tokenId);
  const { contractAddress } = envConfig;
  const { auction: { priceStep, status, stopAt }, price, seller } = offer;
  const [bids, setBids] = useState(offer.auction.bids)
  const timeLeft = useTimeToFinishAuction(stopAt);
  const { yourBidIsLeading, yourBidIsOutbid } = useBidStatus(bids, account || '');
  const { apiSettings } = useSettings();
  const { cancelAuction, withdrawBids } = useAuctionApi();
  const escrowAddress = apiSettings?.blockchain?.escrowAddress;
  const { systemChain } = useApi();
  const [waitingResponse, setWaitingResponse] = useState<Boolean>(false);
  const routerHistory = useHistory();
  const [calculatedBid, setCalculatedBidFromServer] = useState<TCalculatedBid>({} as TCalculatedBid);
  const { getCalculatedBid } = useAuctionApi();

  useEffect(() => {
    getCalculatedBid({ collectionId, tokenId, account, setCalculatedBidFromServer });
  }, [collectionId, tokenId, account, setCalculatedBidFromServer])

  const bid = bids.length > 0 ? Number(price) + Number(priceStep) : price;
  const currentChain = systemChain.split(' ')[0];
  const lastBidFromThisAccount = calculatedBid?.bidderPendingAmount;
  const requiredSurchargeToPastBid = Number(formatKsmBalance(new BN(Number(bid)))) * 1e12 - (Number(lastBidFromThisAccount?.amount) || 0);
  const lowBalance = Number(formatKsmBalance(kusamaAvailableBalance)) * 1e12 < (requiredSurchargeToPastBid + Number(formatKsmBalance(fee)) * 1e12);

  const columnsArray = [
    {
      title: 'Bid',
      dataIndex: 'bid',
      key: 'bid',
      width: 150,
      headingTextSize: 'm' as TSize,
      color: 'blue-grey' as TColor,
      icon: 'arrows-down-up',
      render: (rowNumber: number) => (
        <Text size="m" color="additional-dark">
          {bids.length ? `${adaptiveFixed(Number(formatKsmBalance(new BN((bids[rowNumber].balance === '0') ? bids[rowNumber].amount : bids[rowNumber].balance))), 6)} KSM` : ''} 
        </Text>
      )
    },
    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
      width: 200,
      headingTextSize: 'm' as TSize,
      color: 'blue-grey' as TColor,
      icon: 'calendar',
      render: (rowNumber: number) => (
        <Text size="m" color="blue-grey-600">
          {getFormatedBidsTime(bids[rowNumber].createdAt)}
        </Text>
      )
    },
    {
      title: 'Bidder',
      dataIndex: 'bidder',
      key: 'bidder',
      width: 150,
      render: (rowNumber: number) => (
        <a href={`https://uniquescan.io/${currentChain}/account/${[...bids].reverse()[rowNumber].bidderAddress}`}>
          <Text size="m" color="primary-500">
            {bids.length ? shortAddress(bids[rowNumber].bidderAddress) : ''}
          </Text>
        </a>
      )
    }
  ]
  const userHasBids = getBidsFromAccount(account, bids).length > 0;
  const uSellIt = seller === account;
  // should I take into account Substrate and Ethereum?
  const uOwnIt = tokenInfo?.owner?.Substrate === account || tokenInfo?.owner?.Ethereum?.toLowerCase() === ethAccount || uSellIt;

  const tokenPrice = (tokenAsk?.flagActive === '1' && tokenAsk?.price && tokenAsk?.price.gtn(0)) ? tokenAsk.price : 0;
  const isOwnerContract = !uOwnIt && tokenInfo?.owner?.Ethereum?.toLowerCase() === contractAddress;

  console.log('offer',offer);
  const goBack = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    history.back();
  }, []);

  const onTransferSuccess = useCallback(() => {
    sendCurrentUserAction('UPDATE_TOKEN_STATE');
  }, [sendCurrentUserAction]);

  // transferFee
  const getFee = useCallback(async () => {
    if (bid && escrowAddress) {
      const kusamaFee: BN | null = await getKusamaTransferFee(escrowAddress, new BN(bid));

      if (kusamaFee) {
        setFee(kusamaFee);
      }
    }
  }, [bid, escrowAddress, getKusamaTransferFee]);

  const onCancel = useCallback(() => {
    cancelAuction(account, collectionId, tokenId, setWaitingResponse)
  }, [account, collectionId, tokenId, setWaitingResponse]);

  const toggleBetForm = useCallback(() => {
    setShowBetForm(!showBetForm);
  }, [showBetForm]);

  const closeBetModal = useCallback(() => {
    setShowBetForm(false);
    getOffer(collectionId, tokenId);
  }, []);

  const withdraw = useCallback(() => {
    withdrawBids(account, collectionId, tokenId, setWaitingResponse)
  }, [account, collectionId, tokenId, setWaitingResponse]);

  useEffect(()=>{
    setBids(offer.auction.bids);
  },[offer])

  useEffect(() => {
    if (apiSettings && apiSettings.auction && apiSettings.auction.socket) {

      const auction = {
        collectionId: collectionId,
        tokenId: tokenId,
      };

      console.log('auc', auction);

      apiSettings.auction.socket.on('data', (d) => {
        console.log('income', auction);
      });

      apiSettings.auction!.socket.emit('subscribeToAuction', auction);

      apiSettings.auction!.socket.on('bidPlaced', (offer) => {
        setBids(offer.auction.bids);
      });

      apiSettings.auction!.socket.on('auctionClosed', (offer) => {
        routerHistory.push(`${window.location.href}`);
      });

      return () => {
        apiSettings.auction!.socket.emit('unsubscribeFromAuction', auction);
      }

    }
    return () => { };
  }, [offer, apiSettings])

  useEffect(() => {
    void getFee();
  }, [getFee]);

  useEffect(() => {
    if (account) {
      setEthAccount(subToEth(account).toLowerCase());
    }
  }, [account]);

  return (
    <div className='toke-details'>
      NFT Auction
      <div
        className='go-back'
      >
        <a
          href='/'
          onClick={goBack}
        >
          <svg
            fill='none'
            height='16'
            viewBox='0 0 16 16'
            width='16'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              d='M13.5 8H2.5'
              stroke='var(--card-link-color)'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            <path
              d='M7 3.5L2.5 8L7 12.5'
              stroke='var(--card-link-color)'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          back
        </a>
      </div>
      <div className='token-info'>
        <div className='token-info--row'>
          <div className='token-info--row--image'>
            {collectionInfo && (
              <Image
                className='token-image-big'
                src={tokenUrl}
              />
            )}
          </div>
          <div className='token-info--row--attributes'>
            <Header as='h3'>
              {collectionInfo && <span>{hex2a(collectionInfo.tokenPrefix)}</span>} #{tokenId}
            </Header>
            {attributes && Object.values(attributes).length > 0 && (
              <div className='accessories'>
                <span>Attributes</span>
                {Object.keys(attributes).map((attrKey) => {
                  if (attrKey === 'ipfsJson') {
                    return null;
                  }

                  if (!Array.isArray(attributes[attrKey])) {
                    return <p key={attrKey}>{attrKey}: {attributes[attrKey]}</p>;
                  }

                  return (
                    <p key={attrKey}>{attrKey}: {(attributes[attrKey] as string[]).join(', ')}</p>
                  );
                })}
              </div>
            )}
            <div className='divider' />
            {(uOwnIt && !uSellIt) && (
              <Header as='h4'>You own it!</Header>
            )}
            {uSellIt && (
              <Header as='h4'>You`re selling it!</Header>
            )}
            {(!uOwnIt && !isOwnerContract && tokenInfo?.owner && tokenAsk?.flagActive !== '1') && (
              <>
                <Header as='h5'>Owned&nbsp;by&emsp;</Header>
                <a href={`https://uniquescan.io/${currentChain}/account/${offer.seller}`}>
                  {offer.seller}
                </a>
              </>
            )}
            <div className='divider' />
            {/* Todo remove 'created' after renew auction dataBase */}
            {status === 'active' || 'created' &&
              <>
                <Timer time={stopAt} />
                <div className='divider' />
              </>}
            <div className='next-bid'>Next minimum bid:</div>
            <div className='price-wrapper'>
              <img src={logoKusama as string} width={32} />
              <div className='price'>{fee && adaptiveFixed(Number(formatKsmBalance(new BN(bid))), 4)}</div>
            </div>
            {bids.length !== 0 && <>
              <div className='price-description'>{`Last bid: ${(adaptiveFixed(Number(formatKsmBalance((new BN(price)))), 4))} KSM`}</div>
              <div className='price-description'>{`Minimum step: ${adaptiveFixed(Number(formatKsmBalance((new BN(priceStep)))), 4)} KSM`}</div>
            </>}
            {!bids.length && <div className='price-description'>{`start price ${adaptiveFixed(Number(formatKsmBalance((new BN(bid)))), 4)} KSM`}</div>}
            <div className='buttons'>
              {(!account && !!tokenPrice) && (
                <div>
                  <Button
                    content='Buy it'
                    disabled
                    title='ass'
                  />
                  <p className='text-with-button'>Сonnect your wallet to make transactions</p>
                </div>
              )}
              <>
                {!uSellIt && <Button
                  content='Place a bid'
                  onClick={toggleBetForm}
                />}
                {userHasBids && <Button
                  className='button-outlined'
                  content={
                    <>
                      Withdraw
                      {waitingResponse && (
                        <Loader
                          active
                          inline='centered'
                        />
                      )}
                    </>
                  }
                  onClick={withdraw}
                />}
                {(uSellIt && !bids.length) && (
                  <Button
                    className='button-danger'
                    content={
                      <>
                        Delist
                        {waitingResponse && (
                          <Loader
                            active
                            inline='centered'
                          />
                        )}
                      </>
                    }
                    onClick={onCancel}
                  />
                )}
              </>
              <div className='time-left'>
                <img src={clock as string} width={24} />
                {timeLeft}
              </div>
              {lowBalance && <div className='low-balance'>Not enough KSM to place bid</div>}
            </div>
            <div className='divider' />
            <div className='offers'>
              <div className='heading'>Offers</div>
              {<div className='leading-bid'>
                {yourBidIsLeading && <div className='bid you-lead'>Your bid is leading</div>}
                {yourBidIsOutbid && <div className='bid you-outbid'>Your offer is outbid</div>}
                {!!bids.length && <div className='current-bid'>Leading bid&emsp;
                  <a href={`https://uniquescan.io/${currentChain}/account/${[...bids].reverse()[0].bidderAddress}`}>
                    {shortAddress([...bids].reverse()[0].bidderAddress)}
                  </a>
                </div>}
                {!bids.length && <div className='current-bid'>There are no bids</div>}
              </div>}
              {!!bids.length && <Table data={[...bids]} columns={columnsArray}></Table>}
            </div>
            {(showBetForm && collectionInfo) && (
              <PlaceABetModal
                account={account}
                offer={offer}
                closeModal={closeBetModal}
                collection={collectionInfo}
                tokenId={tokenId}
                tokenOwner={tokenInfo?.owner}
                updateTokens={onTransferSuccess}
              />
            )}
            {!!(transferStep && transferStep <= 3) && (
              <SaleSteps step={transferStep} />
            )}
            {!!(transferStep && transferStep >= 4) && (
              <BuySteps step={transferStep - 3} />
            )}
            {(!collectionInfo || (account && (!kusamaAvailableBalance || !balance))) && (
              <Loader
                active
                className='load-info'
                inline='centered'
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(NftDetailsAuction);
