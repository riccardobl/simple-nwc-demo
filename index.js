
import {
    SimplePool,
    useWebSocketImplementation,
    finalizeEvent,
    getPublicKey,
    nip47,
    nip04
} from "nostr-tools";

import Ws from 'ws'
useWebSocketImplementation(Ws);

const pendingRequests =[];

async function main(){
    // get nwc link from stdin
    let nwcLink = process.argv[2];
    nwcLink = nwcLink.replace("nostr+walletconnect://", "nostr+walletconnect:");
    const action=process.argv[3];
    console.log("Use nwc ", nwcLink)
    
    const nwcData = nip47.parseConnectionString(nwcLink);
    

    const pool=new SimplePool();
    pool.subscribeMany([nwcData.relay],[
        {
            kinds: [13194, 23194, 23195]
        }
    ],{
        onevent: async (event) => {
            console.log(event);
            const kind = event.kind;
            if (kind == 23195){
                const e=event.tags.find(t=>t[0]==="e")[1];
                const p=event.tags.find(t=>t[0]==="p")[1];
                const encryptedContent = event.content;
                for(const pending of pendingRequests){
                    if(pending.id===e && pending.pubkey===p){
                        console.log("Possible response: ",e, p);
                        console.log("Decrypt using ", "priv", pending.secret, "pub", pending.providerPubKey);
                        const decryptedContent = await nip04.decrypt(pending.secret, pending.providerPubKey, encryptedContent);
                        console.log("Received response: ", JSON.stringify(decryptedContent, null, 2));
                    }
                }
            }
        }
    });


    let content;

    if(action=="pay"){
        const invoice=process.argv[4];
        console.log("Pay invoice: ", invoice)
        content = {
            method: "pay_invoice",
            params: {
                invoice
            },
        };
    }else{
        content = {
            method: "make_invoice",
            params: {
                amount: Math.floor(100 * 1000), // value in msats
                description: "Test Invoice", // invoice's description, optional
                expiry: 3600, // expiry in seconds, optional
            },
        };
    }


    const encryptedContent = await nip04.encrypt(nwcData.secret, nwcData.pubkey, JSON.stringify(content));

    console.log("Encrypted content: ", encryptedContent)

    let event = {
        kind: 23194,
        content: encryptedContent,
        created_at: Math.round(Date.now() / 1000),
        tags: [["p", nwcData.pubkey]],
    };
    event = finalizeEvent(event,nwcData.secret);

    pendingRequests.push({
        id: event.id,
        pubkey: getPublicKey(nwcData.secret),
        secret: nwcData.secret,
        providerPubKey: nwcData.pubkey
    })
    pool.publish([nwcData.relay], event)

}


main();