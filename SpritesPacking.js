(function (module){ "use strict";
var Canvas = module.Canvas || Canvas || (typeof require !== 'undefined' ? require('canvas') : null);
var fs  = module.fs || fs || (typeof require !== 'undefined' ? require('fs') : null);
var Image = module.Image || Image || Canvas.Image;

var SpritesPacking = function SpritesPacking (pathFolder) {
    this.init(pathFolder);
};

SpritesPacking.prototype.init = function (pathFolder) {
    var self = this;
    if (!pathFolder) return;
    pathFolder = pathFolder.replace(/\/$/, '');

    this.get_tiles(pathFolder, function (tiles) {
        self.set_tiles_offset(tiles);
        self.packing(tiles);
        self.generate_image(tiles, pathFolder);
        self.generate_data(tiles, pathFolder);
    });
};

SpritesPacking.prototype.generate_image = function (tiles, pathFolder) {
    var width = 0;
    var height = 0;
    for (var i in tiles) {
        var tile = tiles[i];
        if (tile.pos_x+tile.size_x > width)  width = tile.pos_x+tile.size_x;
        if (tile.pos_y+tile.size_y > height) height = tile.pos_y+tile.size_y;
    }
    var canvas = new Canvas(width, height);
    var ctx = canvas.getContext("2d");
    for (var i in tiles) {
        var tile = tiles[i];
        ctx.drawImage(tile.image, tile.pos_x-tile.offset_x, tile.pos_y-tile.offset_y);
    }

    canvas.toBuffer(function(err, buf){
        if (err) throw err;
        fs.writeFile(pathFolder + "/SpritesPacking.png", buf);
    });
};

SpritesPacking.prototype.generate_data = function (tiles, pathFolder) {
    var data = "#id:width,height,offset_x,offset_y,size_x, size_y";
    for (var i=0; i<tiles.length; i++) {
        var tile = tiles[i];
        data += "\n"+tile.id+":" +
            tile.image.width+","+tile.image.height +","+
            tile.offset_x+","+tile.offset_y+"," +
            tile.size_x+","+tile.size_y;
    }
    fs.writeFile(pathFolder + "/SpritesPacking.data", data);
};

SpritesPacking.prototype.get_tiles = function (pathFolder, callback) {
    var files = [];
    var data = fs.readdirSync(pathFolder);
    for (var k in data) {
        var file = pathFolder + '/' + data[k];
        if (!fs.lstatSync(file).isDirectory() && file.match(/\.png$/) && data[k] != "SpritesPacking.png") {
            files.push(file);
        }
    }

    var tiles = [];
    for (var i in files) {
        var img = new Image();
        img.onload = function (){
            tiles.push({
                'id':    img.src.slice(pathFolder.length+1, img.src.length-4),
                'image':  img,
            });
            if (tiles.length == files.length) {
                callback.call(this, tiles);
            }
        };
        img.onerror = function (error){
            error.src = img.src;
            throw error;
        };
        img.src = files[i];
    }
};

SpritesPacking.prototype.margin = 0;
SpritesPacking.prototype.set_tiles_offset = function (tiles) {
    for (var i in tiles) {
        var tile = tiles[i];
        var width = tile.image.width;
        var height = tile.image.height;
        var canvas = new Canvas(width, height);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(tile.image, 0, 0);
        var pixels = ctx.getImageData(0,0,width,height).data;

        var max_x = 1;
        var min_x = width;
        var max_y = 1;
        var min_y = height;

        var index = pixels.length;
        while(index) {
            index -= 4;
            var x = (index>>2)%width;
            var y = (index>>2)/width | 0;
            if (pixels[index + 3]) {
                if (max_x < x+1) max_x = x+1;
                if (max_y < y+1) max_y = y+1;
                if (min_x > x) min_x = x;
                if (min_y > y) min_y = y;
            }
        }

        tile.size_x = max_x-min_x+this.margin;
        tile.size_y = max_y-min_y+this.margin;
        tile.offset_x = min_x;
        tile.offset_y = min_y;
        tile.outer_x = width-max_x;
        tile.outer_y = height-max_y;
    }
    return tiles;
};

SpritesPacking.prototype.packing = function (tiles) {
    var max_x = this.get_max_size(tiles);
    tiles.sort(this._sort_method);
    var table = this._packing(tiles, max_x);
    return table;
};

SpritesPacking.prototype.get_max_size = function (tiles) {
    var size_sqrt = 0;
    var min = 0;
    for (var index in tiles) {
        var tile = tiles[index];
        if (tile.size_x > min) min = tile.size_x;
        size_sqrt += tile.size_x * tile.size_y;
    }
    var max = Math.ceil(Math.sqrt(size_sqrt) * 1.2);
    if (min > max) max = min;
    return max;
};

SpritesPacking.prototype._sort_method = function (a,b) {
    // Sort by size
    return b.size_x != a.size_x ? b.size_x - a.size_x :
        (b.size_y != a.size_y ? b.size_y - a.size_y : b.id - a.id);
};

SpritesPacking.prototype._check_place = function (table, posx, posy, sizex, sizey) {
    var dpos = -1;
    for (var y=0; y<sizey; y++) {
        for (var x=0; x<sizex; x++) {
            if (!table[posy+y]) table[posy+y] = [];
            if (table[posy+y][posx+x] != null) {
                if (dpos < x) {
                    dpos = x;
                    if (dpos == sizex) {
                        return dpos+1;
                    }
                }
            }
        }
    }
    return dpos+1;
};

SpritesPacking.prototype._packing = function (tiles, max_x) {
    // Compute tiles positions on the grid
    var table = [];
    var minpos = 0;
    var tile, x, y, pos, dpos, x2, y2, i, len, px;
    max_x |= 0;
    for (i=0, len=tiles.length; i<len; i++) {
        tile = tiles[i];
        tile.id = tile.id || i;
        x = tile.size_x;
        y = tile.size_y;
        pos = minpos;

        if (x>max_x) throw new Error(x+">"+max_x+" : Tile ("+tile.id+") is greather than max size x");

        while ((px = pos%max_x)>max_x-x || (dpos = this._check_place(table, px, pos/max_x | 0, x, y))) {
            if (px+dpos>max_x) dpos = max_x - px;
            pos+=dpos;
        }

        if (x==1 && y==1) { // simple heuristic for CPU optimization
            minpos = pos/max_x | 0;
        }

        for (y2=0; y2<y; y2++) {
            for (x2=0; x2<x; x2++) {
                if (!table[(pos/max_x | 0)+y2]) table[(pos/max_x | 0)+y2] = [];
                table[(pos/max_x | 0)+y2][(pos%max_x)+x2] = tile.id;
            }
        }
        if (!table[pos/max_x | 0]) table[pos/max_x | 0] = [];
        table[pos/max_x | 0][pos%max_x] = tile.id;
        tile.pos_y = pos/max_x | 0;
        tile.pos_x = pos%max_x;
    }

    return table;
};


if (process && process.argv) {
    if (process.argv[1].indexOf("SpritesPacking.js") > -1 && process.argv[2]) {
        var obj = new SpritesPacking( process.argv[2] );
    }
    if (process.argv[2] === "-h" || process.argv[2] === "--help") {
        console.log("To create a sprites packing from a folder of png images use: node SpritesPacking.js ~/your path folder of tiles/");
    }
}


module.SpritesPacking = SpritesPacking;
if(typeof module.exports !== 'undefined') module.exports = SpritesPacking;
})(typeof module === 'undefined' ? this : module);
