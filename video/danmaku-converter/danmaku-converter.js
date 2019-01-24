(() =>
{
    return (settings, resources) =>
    {
        class Danmaku
        {
            constructor(content, time, type, fontSize, color)
            {
                this.content = content;
                this.time = time;
                this.type = parseInt(type);
                this.fontSize = parseFloat(fontSize);
                this.color = parseInt(color);
            }
        }
        class XmlDanmaku extends Danmaku
        {
            constructor({ content, time, type, fontSize, color, timeStamp, pool, userHash, rowId })
            {
                super(content, time, type, fontSize, color);
                this.timeStamp = parseInt(timeStamp);
                this.pool = parseInt(pool);
                this.userHash = userHash;
                this.rowId = parseInt(rowId);
                this.time = parseFloat(this.time);
                this.pDataArray = [time, type, fontSize, color, timeStamp, pool, userHash, rowId];
            }
            text()
            {
                const pData = this.pDataArray.join(",");
                return `<d p="${pData}">${this.content}</d>`;
            }
            static parse(element)
            {
                const pData = element.getAttribute("p");
                const [time, type, fontSize, color, timeStamp, pool, userHash, rowId] = pData.split(",");
                const content = element.innerHTML;
                return new XmlDanmaku({ content, time, type, fontSize, color, timeStamp, pool, userHash, rowId });
            }
        }
        class XmlDanmakuDocument
        {
            constructor(xml)
            {
                this.xml = xml;
                const document = new DOMParser().parseFromString(xml, "application/xml").documentElement;
                this.danmakus = [...document.querySelectorAll("d[p]")].map(it => XmlDanmaku.parse(it));
            }
        }
        class AssDanmaku extends Danmaku
        {
            constructor({ content, time, type, fontSize, color, typeTag, colorTag, endTime })
            {
                super(content, time, type, fontSize, color);
                this.typeTag = typeTag;
                this.colorTag = colorTag;
                this.endTime = endTime;
            }
            text(fontStyles)
            {
                const styleName = fontStyles[this.fontSize].match(/Style:(.*?),/)[1].trim();
                return `Dialogue: 0,${this.time},${this.endTime},${styleName},,0,0,0,,{${this.typeTag}${this.colorTag}}${this.content}`;
            }
        }
        class AssDanmakuDocument
        {
            constructor({ danmakus, title, fontStyles, blockTypes, resolution })
            {
                this.danmakus = danmakus;
                this.title = title;
                this.fontStyles = fontStyles;
                this.blockTypes = blockTypes;
                this.resolution = resolution;
            }
            generateAss()
            {
                const meta = `
[Script Info]
; Script generated by Bilibili Evolved Danmaku Converter
; https://github.com/the1812/Bilibili-Evolved/
Title: ${this.title}
ScriptType: v4.00+
PlayResX: ${this.resolution.x}
PlayResY: ${this.resolution.y}
Timer: 10.0000
WrapStyle: 2
ScaledBorderAndShadow: no

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${Object.values(this.fontStyles).join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
                `.trim();
                return meta + "\n" + this.danmakus
                    .map(it => it.text(this.fontStyles, this.blockTypes))
                    .filter(it => it !== "").join("\n");
            }
        }

        class DanmakuStack
        {
            constructor(font, resolution, duration, bottomMarginPercent)
            {
                this.horizontalDanmakus = [];
                this.horizontalTrack = [];
                this.verticalDanmakus = [];
                this.verticalTrack = [];
                this.resolution = resolution;
                this.duration = duration;
                this.canvas = document.createElement("canvas");
                this.context = this.canvas.getContext("2d");
                // XML字体大小到实际大小的表
                this.fontSizes = {
                    25: `52px ${font}`,
                    18: `36px ${font}`,
                };
                this.danmakuType = {
                    1: "normal",
                    2: "normal",
                    3: "normal",
                    4: "bottom",
                    5: "top",
                    6: "reversed",
                    7: "special",
                    8: "special",
                };
                this.bottomMarginPercent = bottomMarginPercent;
                this.margin = 4;
                this.nextDanmakuDelay = 0.05;
                this.generateTracks();
            }
            generateTracks()
            {
                const height = 52;
                this.danmakuHeight = height;
                this.trackHeight = this.margin * 2 + height;
                this.trackCount = parseInt(fixed(this.resolution.y * (1 - this.bottomMarginPercent) / this.trackHeight, 0));
            }
            getTextSize(danmaku)
            {
                this.context.font = this.fontSizes[danmaku.fontSize];
                const metrics = this.context.measureText(danmaku.content);
                const x = metrics.width / 2;
                return [x, this.danmakuHeight / 2];
            }
            getTags(danmaku, { targetTrack, initTrack, nextTrack, isClosestDanmaku, getTrackItem, getTag })
            {
                const [x, y] = this.getTextSize(danmaku);
                const width = x * 2;
                const visibleTime = this.duration(danmaku) * width / (this.resolution.x + width) + this.nextDanmakuDelay;
                let track = initTrack;
                let closestDanmaku = null;
                // 寻找已发送弹幕中可能重叠的
                do
                {
                    closestDanmaku = targetTrack.find(isClosestDanmaku);
                    track += nextTrack;
                }
                while (closestDanmaku && track <= this.trackCount && track >= 0);

                // 如果弹幕过多, 此条就不显示了
                if (track > this.trackCount || track < 0)
                {
                    return `\\pos(0,-999)`;
                }
                track -= nextTrack; // 减回最后的自增
                targetTrack.push(getTrackItem({ track, width, visibleTime }));
                return getTag({ track, x, y });
            }
            getHorizonalTags(danmaku)
            {
                return this.getTags(danmaku, {
                    targetTrack: this.horizontalTrack,
                    initTrack: 0,
                    nextTrack: 1,
                    isClosestDanmaku: it =>
                    {
                        if (it.track !== track)
                        {
                            return false;
                        }
                        if (it.width < width) // 弹幕比前面的弹幕长
                        {
                            // 必须等前面弹幕走完
                            return this.duration(danmaku) * this.resolution.x / (this.resolution.x + width) <= it.end - danmaku.time;
                        }
                        else
                        {
                            return it.visible > danmaku.time;
                        }
                    },
                    getTrackItem: ({ track, width, visibleTime }) =>
                    {
                        return {
                            width: width,
                            start: danmaku.time,
                            visible: danmaku.time + visibleTime,
                            end: danmaku.time + this.duration(danmaku),
                            track: track
                        };
                    },
                    getTag: ({ track, x, y }) =>
                    {
                        return `\\move(${this.resolution.x + x},${track * this.trackHeight + this.margin + y},${-x},${track * this.trackHeight + this.margin + y},0,${this.duration(danmaku) * 1000})`;
                    },
                });
                // const [x, y] = this.getTextSize(danmaku);
                // const width = x * 2;
                // const time = this.duration(danmaku) * width / (this.resolution.x + width) + this.nextDanmakuDelay;
                // let track = 0;
                // let closestDanmaku = null;
                // const isClosestDanmaku = it =>
                // {
                //     if (it.track !== track)
                //     {
                //         return false;
                //     }
                //     if (it.width < width) // 弹幕比前面的弹幕长
                //     {
                //         // 必须等前面弹幕走完
                //         return this.duration(danmaku) * this.resolution.x / (this.resolution.x + width) <= it.end - danmaku.time;
                //         //return it.end > danmaku.time;
                //     }
                //     else
                //     {
                //         return it.visible > danmaku.time;
                //     }
                // };
                // // 寻找已发送弹幕中可能重叠的
                // do
                // {
                //     closestDanmaku = this.horizontalTrack.find(isClosestDanmaku);
                //     track++;
                // }
                // while (closestDanmaku && track <= this.trackCount);

                // // 如果弹幕过多, 此条就不显示了
                // if (track > this.trackCount)
                // {
                //     return `\\pos(0,-999)`;
                // }
                // track--; // 减回最后的自增
                // this.horizontalTrack.push({
                //     width: width,
                //     start: danmaku.time,
                //     visible: danmaku.time + time,
                //     end: danmaku.time + this.duration(danmaku),
                //     track: track
                // });
                // return `\\move(${this.resolution.x + x},${track * this.trackHeight + this.margin + y},${-x},${track * this.trackHeight + this.margin + y},0,${this.duration(danmaku) * 1000})`;
            }
            getVerticalTags(danmaku)
            {
                const isTop = this.danmakuType[danmaku.type] === "top";
                this.getTags(danmaku, {
                    targetTrack: this.verticalTrack,
                    initTrack: isTop ? 0 : this.trackCount - 1,
                    nextTrack: isTop ? 1 : -1,
                    isClosestDanmaku: it =>
                    {
                        if (it.track !== track)
                        {
                            return false;
                        }
                        return it.end > danmaku.time;
                    },
                    getTrackItem: ({ track }) =>
                    {
                        return {
                            start: danmaku.time,
                            end: danmaku.time + this.duration(danmaku),
                            track: track
                        };
                    },
                    getTag: ({ track, y }) =>
                    {
                        if (isTop)
                        {
                            return `\\pos(${this.resolution.x / 2},${track * this.trackHeight + this.margin + y})`;
                        }
                        else
                        {
                            return `\\pos(${this.resolution.x / 2},${this.resolution.y - this.margin - y - (this.trackCount - 1 - track) * this.trackHeight})`;
                        }
                    },
                });
                // const [, y] = this.getTextSize(danmaku);
                // let closestDanmaku = null;
                // let track = isTop ? 0 : this.trackCount - 1;
                // const nextTrack = isTop ? 1 : -1;
                // const isClosestDanmaku = it =>
                // {
                //     if (it.track !== track)
                //     {
                //         return false;
                //     }
                //     return it.end > danmaku.time;
                // };
                // do
                // {
                //     closestDanmaku = this.verticalTrack.find(isClosestDanmaku);
                //     track += nextTrack;
                // }
                // while (closestDanmaku && track <= this.trackCount && track >= 0);
                // if (track > this.trackCount || track < 0)
                // {
                //     return `\\pos(0,-999)`;
                // }
                // track -= nextTrack;
                // this.verticalTrack.push({
                //     start: danmaku.time,
                //     end: danmaku.time + this.duration(danmaku),
                //     track: track
                // });
                // if (isTop)
                // {
                //     return `\\pos(${this.resolution.x / 2},${track * this.trackHeight + this.margin + y})`;
                // }
                // else
                // {
                //     return `\\pos(${this.resolution.x / 2},${this.resolution.y - this.margin - y - (this.trackCount - 1 - track) * this.trackHeight})`;
                // }
            }
            push(danmaku)
            {
                let tags = null;
                let stack = null;
                switch (this.danmakuType[danmaku.type])
                {
                    case "normal":
                    case "reversed": // 反向先鸽了, 直接当正向了
                        {
                            tags = this.getHorizonalTags(danmaku);
                            stack = this.horizontalDanmakus;
                            break;
                        }
                    case "top":
                    case "bottom":
                        {
                            tags = this.getVerticalTags(danmaku);
                            stack = this.verticalDanmakus;
                            break;
                        }
                    case "special": // 高级弹幕也鸽了先
                    default:
                        {
                            return {
                                tags: `\\pos(0,-999)`,
                            };
                        }
                }
                const info = {
                    tags
                };
                stack.push(info);
                return info;
            }
        }
        class DanmakuConverter
        {
            constructor({ title, font, alpha, duration, blockTypes, resolution, bottomMarginPercent, bold })
            {
                this.title = title;
                this.font = font;
                this.alpha = Math.round(alpha * 100);
                this.duration = duration;
                this.blockTypes = blockTypes;
                this.resolution = resolution;
                this.bold = bold;
                this.white = 16777215; // Dec color of white danmaku
                this.danmakuStack = new DanmakuStack(font, resolution, duration, bottomMarginPercent);
            }
            get fontStyles()
            {
                return {
                    25: `Style: Medium,${this.font},52,&H${this.alpha}FFFFFF,&H${this.alpha}FFFFFF,&H${this.alpha}000000,&H${this.alpha}000000,${this.bold ? "1" : "0"},0,0,0,100,100,0,0,1,1.2,0,5,0,0,0,0`,
                    18: `Style: Small,${this.font},36,&H${this.alpha}FFFFFF,&H${this.alpha}FFFFFF,&H${this.alpha}000000,&H${this.alpha}000000,${this.bold ? "1" : "0"},0,0,0,100,100,0,0,1,1.2,0,5,0,0,0,0`,
                };
            }
            convertToAssDocument(xml)
            {
                const xmlDanmakuDocument = new XmlDanmakuDocument(xml);
                const assDanmakus = [];
                for (const xmlDanmaku of xmlDanmakuDocument.danmakus.sort((a, b) => a.time - b.time))
                {
                    // 跳过设置为屏蔽的弹幕类型
                    if (this.blockTypes.indexOf(xmlDanmaku.type) !== -1 ||
                        this.blockTypes.indexOf("color") !== -1 && xmlDanmaku.color !== this.white)
                    {
                        continue;
                    }
                    const [startTime, endTime] = this.convertTime(xmlDanmaku.time, this.duration(xmlDanmaku));
                    assDanmakus.push(new AssDanmaku({
                        content: this.convertText(xmlDanmaku.content),
                        time: startTime,
                        endTime: endTime,
                        type: xmlDanmaku.type,
                        fontSize: xmlDanmaku.fontSize,
                        color: xmlDanmaku.color,
                        typeTag: this.convertType(xmlDanmaku),
                        colorTag: this.convertColor(xmlDanmaku.color),
                    }));
                }
                return new AssDanmakuDocument({
                    danmakus: assDanmakus,
                    title: this.title,
                    blockTypes: this.blockTypes,
                    fontStyles: this.fontStyles,
                    resolution: this.resolution
                });
            }
            convertText(text)
            {
                const map = {
                    "{": "｛",
                    "}": "｝",
                    "&amp;": "&",
                    "&lt;": "<",
                    "&gt;": ">",
                    "&quot;": '"',
                    "&apos;": "'",
                };
                for (const [key, value] of Object.entries(map))
                {
                    text = text.replace(new RegExp(key, "g"), value);
                }
                return text;
            }
            convertType(danmaku)
            {
                return this.danmakuStack.push(danmaku).tags;
            }
            convertColor(decColor)
            {
                if (decColor === this.white)
                {
                    return "";
                }
                const hex = decColor.toString(16);
                const red = hex.substring(0, 2);
                const green = hex.substring(2, 4);
                const blue = hex.substring(4, 6);
                return `\\c&H${blue}${green}${red}&`;
            }
            convertTime(startTime, duration)
            {
                function round(number)
                {
                    const [integer, decimal = "00"] = String(number).split(".");
                    return `${integer.padStart(2, "0")}.${decimal.substr(0, 2).padEnd(2, "0")}`;
                }
                function secondsToTime(seconds)
                {
                    let hours = 0;
                    let minutes = 0;
                    while (seconds >= 60)
                    {
                        seconds -= 60;
                        minutes++;
                    }
                    while (minutes >= 60)
                    {
                        minutes -= 60;
                        hours++;
                    }
                    return `${hours}:${String(minutes).padStart(2, "0")}:${round(seconds)}`;
                }
                return [secondsToTime(startTime), secondsToTime(startTime + duration)];
            }
        }
        return {
            export: {
                AssDanmaku,
                AssDanmakuDocument,
                Danmaku,
                DanmakuConverter,
                DanmakuStack,
                XmlDanmaku,
                XmlDanmakuDocument,
            },
        };
    };
})();