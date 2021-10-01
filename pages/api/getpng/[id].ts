import type { NextApiRequest, NextApiResponse } from "next";

export default (req: NextApiRequest, res: NextApiResponse) => {
    let { id } = req.query;
    if (typeof id != "string") {
        id = id.join("");
    }
    res.redirect(`http://zilmorphs.com/morph/${id}.png`);
};
