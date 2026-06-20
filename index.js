const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const app = express();
const PORT = process.env.PORT || 3000;

// १. Firebase Database Connect गर्ने
// तपाईंको image (1000039293.png) मा देखिए अनुसारको public rules भएकोले यो configuration ले सिधै काम गर्छ
if (admin.apps.length === 0) {
    admin.initializeApp({
        databaseURL: "https://sajilokamai-72496-default-rtdb.firebaseio.com"
    });
}

const db = admin.database();

// Playtime Dashboard बाट प्राप्त हुने Environment Variables
const APP_KEY = process.env.YOUR_APPLICATION_KEY;
const SECRET_KEY = process.env.YOUR_APPLICATION_SECRET_KEY;

// मुख्य पोस्टब्याक रूट (Endpoint)
app.get('/postback', async (req, res) => {
    // Playtime Ads ले पठाउने सबै प्यारामिटरहरू लिने
    const { 
        user_id, 
        offer_id, 
        offer_name, 
        payout, 
        event, 
        signature, 
        amount, 
        conversionDatetime, 
        clickIp,
        currency_name
    } = req.query;

    // आवश्यक डाटाहरू आएका छन् कि छैनन् चेक गर्ने
    if (!user_id || !offer_id || !amount || !signature || !event) {
        console.log("[Error] Missing required parameters in request.");
        return res.status(400).send("Missing parameters");
    }

    // २. Playtime डकुमेन्टेसन अनुसार Signature Validation (सुरक्षा जाँच)
    const dataToHash = `${user_id}${offer_id}${event}${APP_KEY}${SECRET_KEY}`;
    const calculatedSignature = crypto.createHash('sha1').update(dataToHash).digest('hex');

    if (signature !== calculatedSignature) {
        console.log(`[Warning] Invalid signature hash for User: ${user_id}`);
        return res.status(403).send("Invalid Signature");
    }

    try {
        const rewardAmount = parseInt(amount, 10);
        
        // तपाईंको डेटाबेसको /users/USER_ID लोकेसन Reference
        const userRef = db.ref(`users/${user_id}`);
        const historyRef = db.ref(`users/${user_id}/history`);

        // ३. डेटाबेसमा रहेको 'balance' लाई सिधै बढाउने (Atomic Transaction)
        await userRef.child('balance').transaction((currentBalance) => {
            // यदि युजरको पहिले ब्यालेन्स छैन भने ० बाट सुरु गरेर बढाउँछ
            return (currentBalance || 0) + rewardAmount;
        });

        // ४. अफर कहाँबाट र कसरी आयो भन्ने पुरै डिटेल 'history' भित्र सेभ गर्ने
        await historyRef.push({
            offer_id: offer_id,
            offer_name: offer_name || "Playtime Offerwall Task",
            payout_usd: payout || "0.00",
            amount_credited: rewardAmount,
            event_type: event,
            date_time: conversionDatetime || new Date().toISOString(),
            user_ip: clickIp || "0.0.0.0",
            currency: currency_name || "Coins",
            status: "Success",
            timestamp: Date.now()
        });

        console.log(`[Success] Updated balance by +${rewardAmount} & saved full details for User: ${user_id}`);
        
        // Playtime Ads लाई काम सफल भयो भनी 'OK' रेस्पोन्स पठाउने
        return res.status(200).send("OK");

    } catch (error) {
        console.error("Firebase Database Operation Error:", error);
        return res.status(500).send("Internal Server Error");
    }
});

// सर्भर अन गर्ने
app.listen(PORT, () => {
    console.log(`Postback server is successfully running on port ${PORT}`);
});
