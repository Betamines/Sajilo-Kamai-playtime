const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// तपाईंको एकाउन्टको साँचोहरू (Keys) र सिधै चल्ने URL
const APP_KEY = "616ffcd94caa04ea";
const SECRET_KEY = "YUKDWKH2N5RGP8L2QKW13OPBTW6D1O"; 
const FIREBASE_DB_URL = "https://sajilokamai-72496-default-rtdb.firebaseio.com";

// मुख्य पोस्टब्याक रूट (Endpoint)
app.get('/postback', async (req, res) => {
    let { 
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

    // युजर आईडी र कोइन अमाउन्ट हुन अनिवार्य छ
    if (!user_id || !amount) {
        console.log("[Error] Missing user_id or amount.");
        return res.status(400).send("Missing parameters");
    }

    // १. चलाखीपूर्ण सुरक्षा जाँच (Secret Key र Signature को प्रयोग)
    // यदि यो वास्तविक युजर हो (आईडी 'TEST_' बाट सुरु भएको छैन) भने मात्र सिग्नेचर कडा रूपमा चेक गर्ने
    if (!user_id.startsWith("TEST_")) {
        if (!signature) {
            console.log("[Warning] Blocked: Missing signature from live request.");
            return res.status(400).send("Missing signature");
        }

        const dataToHash = `${user_id}${offer_id || ''}${event || ''}${APP_KEY}${SECRET_KEY}`;
        const calculatedSignature = crypto.createHash('sha1').update(dataToHash).digest('hex');

        if (signature !== calculatedSignature) {
            console.log(`[Warning] Security block: Invalid signature hash for User: ${user_id}`);
            return res.status(403).send("Invalid Signature. Request blocked.");
        }
    } else {
        console.log(`[Info] Test callback detected. Bypassing signature check for Playtime testing tool.`);
    }

    // २. टेस्ट आईडी व्यवस्थापन
    if (user_id.startsWith("TEST_")) {
        user_id = user_id.replace("TEST_", "");
    }

    try {
        // ३. कोइन अमाउन्टलाई सुरक्षित रूपमा नम्बरमा बदल्ने
        const rewardAmount = Math.round(parseFloat(amount));

        if (isNaN(rewardAmount) || rewardAmount <= 0) {
            console.log(`[Error] Invalid coin amount received: ${amount}`);
            return res.status(400).send("Invalid amount");
        }

        // ४. Firebase बाट युजरको वास्तविक ब्यालेन्स तान्ने
        const userFetchUrl = `${FIREBASE_DB_URL}/users/${user_id}/balance.json`;
        const balanceRes = await fetch(userFetchUrl);
        const currentBalance = await balanceRes.json() || 0;

        const newBalance = currentBalance + rewardAmount;

        // ५. Firebase मा नयाँ ब्यालेन्स सिधै अपडेट (Save) गर्ने
        await fetch(userFetchUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newBalance)
        });

        // ६. अफरको पुरै विवरण 'history' भित्र थप्ने
        const historyPushUrl = `${FIREBASE_DB_URL}/users/${user_id}/history.json`;
        const historyData = {
            offer_id: offer_id || "Live_Offer",
            offer_name: offer_name || "Playtime Task",
            payout_usd: payout || "0.00",
            amount_credited: rewardAmount,
            event_type: event || "conversion",
            date_time: conversionDatetime || new Date().toISOString(),
            user_ip: clickIp || "0.0.0.0",
            currency: currency_name || "Coin",
            status: "Success",
            timestamp: Date.now()
        };

        await fetch(historyPushUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyData)
        });

        console.log(`[Success] Processed successfully! Added +${rewardAmount} coins for User: ${user_id}`);
        return res.status(200).send("OK");

    } catch (error) {
        console.error("Firebase Operation Error:", error);
        return res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Secured Postback server is running on port ${PORT}`);
});
